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
import { AwsService } from './aws';

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

  conversationLoaded$: BehaviorSubject<Conversation> = new BehaviorSubject<Conversation | null>(null);
  onStreamAdded$: Subject<boolean> = new Subject<boolean>();

  localStream: Stream;

  participantsCount = 1;

  constructor(
    @Inject(API_RTC_KEY) public webRtcKey: string,
    @Inject(STREAM_PUBLISH_DELAY) public publishDelay: number,
    private awsService: AwsService
  ) {
    this.userAgent = new UserAgent({ uri: this.webRtcKey });
  }

  getConversation(name: string) {
    return from(this.userAgent.register())
      .pipe(
        map((session) => session.getConversation(name)),
        tap((conversation) => this.conversation = conversation),
        tap(subscribeToStreamListChange),
        tap(() => {
          console.log('con', this.conversation);
        }),
        tap(conversation => conversation.on('streamAdded', this.onStreamAdded)),
        tap(conversation => conversation.on('streamRemoved', this.onStreamRemoved)),
        tap(conversation => conversation.on('contactJoined', (c) => {
          this.participantsCount++;
        })),
        tap(conversation => conversation.on('contactLeft', (c) => {
          this.participantsCount--;
        })),
        switchMap(() => this.conversation.join()),
        tap(() => this.conversationLoaded$.next(this.conversation)),
        map(() => this.conversation)
      );
  }

  onStreamAdded = (stream: Stream) => {
    stream.addInDiv('remote-container', 'remote-media-' + stream.streamId, {}, false);
    this.onStreamAdded$.next(true);
  };

  onStreamRemoved = (stream: Stream) => {
    stream.removeFromDiv('remote-container', 'remote-media-' + stream.streamId);
    this.onStreamAdded$.next(false);
  };

  createMediaStreamFromVideo(video: HTMLVideoElement): Observable<any> {
    const mediaStream = (video as any).captureStream();
    if (true) {
      return from(this.awsService.shareVideoFile(mediaStream))
        .pipe(
        )
    }

    return (from(this.userAgent.createStreamFromMediaStream(mediaStream))
      .pipe(
        takeUntil(this.onStreamAdded$),
        delay(this.publishDelay),
        switchMap((stream) => this.conversation.publish(stream)),
        tap((stream) => this.localStream = stream),
        catchError(err => {
          console.error('Create stream error', err);
          return err
        })
      ) as Observable<Stream>);
  }

  cancelStream() {
    if (true) {
      this.awsService.cancelStream();
    } else {
      this.conversation.unpublish(this.localStream);
      this.localStream = null;
    }
  }
}
