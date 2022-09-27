import { Inject, Injectable } from '@angular/core';
import { Conversation, Stream, StreamInfo, UserAgent } from '@apirtc/apirtc';
import { BehaviorSubject, catchError, from, map, Observable, Subject, switchMap, tap } from 'rxjs';
import { API_RTC_KEY, STREAM_PUBLISH_DELAY } from '../tokens';

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
export class RtcStreamService {
  userAgent: UserAgent;
  conversation: Conversation = null;

  conversationLoaded$: BehaviorSubject<Conversation> = new BehaviorSubject<Conversation | null>(null);
  onStreamAdded$: Subject<boolean> = new Subject<boolean>();

  localStream: Stream;
  remoteStream: Stream;

  participantCountChanged$ = new BehaviorSubject(1);

  constructor(
    @Inject(API_RTC_KEY) public webRtcKey: string,
    @Inject(STREAM_PUBLISH_DELAY) public publishDelay: number
  ) {
    this.userAgent = new UserAgent({ uri: this.webRtcKey });
  }

  getConversation(name = 'test') {
    return from(this.userAgent.register())
      .pipe(
        map((session) => session.getConversation(name)),
        tap((conversation) => this.conversation = conversation),
        tap(subscribeToStreamListChange),
        tap(conversation => conversation.on('streamAdded', this.onStreamAdded)),
        tap(conversation => conversation.on('streamRemoved', this.onStreamRemoved)),
        tap(conversation => conversation.on('contactJoined', (c) => {
          this.participantCountChanged$.next(this.participantCountChanged$.value + 1);
        })),
        tap(conversation => conversation.on('contactLeft', (c) => {
          this.participantCountChanged$.next(this.participantCountChanged$.value - 1);
        })),
        switchMap(() => this.conversation.join()),
        tap(() => this.conversationLoaded$.next(this.conversation)),
        map(() => this.conversation)
      );
  }

  leaveConversation() {
    return from(this.conversation.leave())
      .pipe(
        tap(() => this.conversation = null)
      );
  }

  onStreamAdded = (stream: Stream) => {
    this.remoteStream = stream;
    stream.addInDiv('remote-container', 'remote-media-' + stream.streamId, {}, false);
    this.onStreamAdded$.next(true);
  };

  onStreamRemoved = (stream: Stream) => {
    this.remoteStream = null;
    stream.removeFromDiv('remote-container', 'remote-media-' + stream.streamId);
    this.onStreamAdded$.next(false);
  };

  createMediaStreamFromVideo(mediaStream: MediaStream): Observable<any> {
    console.log('streaming from RTC');
    return (from(this.userAgent.createStreamFromMediaStream(mediaStream))
      .pipe(
        switchMap((stream) => this.conversation.publish(stream)),
        tap((stream) => this.localStream = stream),
        catchError(err => {
          console.error('Create stream error', err);
          return err;
        })
      ) as Observable<Stream>);
  }

  unsubscribeToStream() {
    if (this.remoteStream) {
      this.conversation.unsubscribeToStream('' + this.remoteStream.streamId);
    }
  }

  cancelStream() {
    this.conversation.unpublish(this.localStream);
    this.localStream = null;
  }
}
