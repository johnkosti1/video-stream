import { Inject, Injectable } from '@angular/core';
import { Conversation, Stream, StreamInfo, UserAgent } from '@apirtc/apirtc';
import {
  BehaviorSubject,
  catchError,
  delay,
  filter,
  from,
  map,
  Observable,
  Subject,
  switchMap,
  take,
  takeUntil,
  tap
} from 'rxjs';
import { API_RTC_KEY, STREAM_PUBLISH_DELAY } from './tokens';

function subscribeToStreamListChange(conversation: Conversation) {
  conversation.on('streamListChanged', (streamInfo: StreamInfo) => {
    console.log("streamListChanged :", streamInfo);
    if (streamInfo.listEventType === 'added') {
      if (streamInfo.isRemote) {
        conversation.subscribeToMedia('' + streamInfo.streamId)
          .then((stream: any) => {
            console.log('subscribeToMedia success', stream);
          }).catch((err: any) => {
          console.error('subscribeToMedia error', err);
        });
      }
    }
  });
}

@Injectable({
  providedIn: 'root'
})
export class StreamService {
  userAgent: UserAgent;
  conversation: Conversation = null;
  hasRemoteStream = false;

  conversationLoaded$: BehaviorSubject<Conversation> = new BehaviorSubject<Conversation | null>(null);
  onStreamAdded$: Subject<Stream> = new Subject<Stream>();
  onStreamRemoved$: Subject<Stream> = new Subject<Stream>();

  constructor(
    @Inject(API_RTC_KEY) public webRtcKey: string,
    @Inject(STREAM_PUBLISH_DELAY) public publishDelay: number,
  ) {
    this.userAgent = new UserAgent({ uri: this.webRtcKey });
  }

  getConversation(name: string) {
    return from(this.userAgent.register())
      .pipe(
        map((session) => session.getConversation(name)),
        tap((conversation) => this.conversation = conversation),
        tap(subscribeToStreamListChange),
        tap(conversation => conversation.on('streamAdded', this.onStreamAdded)),
        tap(conversation => conversation.on('streamRemoved', this.onStreamRemoved)),
        switchMap(() => this.conversation.join()),
        tap(() => this.conversationLoaded$.next(this.conversation)),
        map(() => this.conversation)
      );
  }

  onStreamAdded = (stream: Stream) => {
    stream.addInDiv('remote-container', 'remote-media-' + stream.streamId, {}, false);
    this.hasRemoteStream = true;
    this.onStreamAdded$.next(stream);
  };

  onStreamRemoved = (stream: Stream) => {
    stream.removeFromDiv('remote-container', 'remote-media-' + stream.streamId);
    this.hasRemoteStream = false;
    this.onStreamRemoved$.next(stream);
  };

  createMediaStreamFromVideo(video: HTMLVideoElement): Observable<Stream> {
    let mediaStream = (video as any).captureStream();

    return (this.conversationLoaded$
      .pipe(
        filter(c => !!c),
        take(1),
        takeUntil(this.onStreamAdded$),
        delay(this.publishDelay),
        switchMap(() => this.userAgent.createStreamFromMediaStream(mediaStream)),
        switchMap((stream) => this.conversation.publish(stream)),
        catchError(err => {
          console.error('Create stream error', err);
          return err
        })
      ) as Observable<Stream>);
  }

  cancelStream(stream: Stream) {
    this.conversation.unpublish(stream);
  }
}
