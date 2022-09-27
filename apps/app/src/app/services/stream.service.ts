import { Inject, Injectable } from '@angular/core';
import { RtcStreamService } from './rtc-stream.service';
import { STREAM_PUBLISH_DELAY, STREAM_SWITCH_THRESHOLD } from '../tokens';
import { AwsService } from './aws.service';
import { delay, filter, map, Observable, of, Subscription, switchMap, take, takeUntil, tap, zip } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StreamService {

  videoElement: HTMLVideoElement;
  participantsSubscription: Subscription;

  get iAmHost() {
    return this.rtcStreamService.localStream || this.awsService.iAmHost;
  }

  hasRemoteStream = false;

  constructor(public rtcStreamService: RtcStreamService,
    @Inject(STREAM_PUBLISH_DELAY) public publishDelay: number,
    @Inject(STREAM_SWITCH_THRESHOLD) public streamSwitchThreshold: number,
    private awsService: AwsService) {
    this.subscribeToParticipantsChangeForHost();
    this.subscribeToRemoteStreams();
  }

  subscribeToParticipantsChangeForHost() {
    this.rtcStreamService.participantCountChanged$
      .pipe(
        filter(() => !!this.rtcStreamService.localStream || this.awsService.iAmHost),
        switchMap((count) => {
          if (this.streamSwitchThreshold && count > this.streamSwitchThreshold && !this.awsService.iAmHost) {
            console.log('should switch to amazon', count);
            return this.startStreamVideo();
          }
          return of(null);
        })
      )
      .subscribe();
  }

  subscribeToRemoteStreams() {
    this.awsService.remoteStreamAdded$
      .pipe(
        filter(() => !this.iAmHost),
        tap(() => {
          if (this.rtcStreamService.remoteStream) {
            this.rtcStreamService.unsubscribeToStream();
          }
        }),
        tap((hasRemoteStream) => this.hasRemoteStream = hasRemoteStream)
      )
      .subscribe();

    this.rtcStreamService.onStreamAdded$
      .pipe(
        filter(() => !this.iAmHost),
        tap((hasRemoteStream) => this.hasRemoteStream = hasRemoteStream)
      )
      .subscribe();
  }

  authenticate() {
    return zip(this.rtcStreamService.getConversation('test'), this.awsService.authenticate());
  }

  leave() {
  }

  startStreamVideo(obs?: Observable<boolean>, element?: HTMLVideoElement) {
    if (element) {
      this.videoElement = element;
    }

    const stream = !obs ? of(true) : obs
      .pipe(
        takeUntil(this.rtcStreamService.onStreamAdded$),
        filter(l => l),
        take(1)
      );

    return stream
      .pipe(
        delay(this.publishDelay),
        map(() => (this.videoElement as any).captureStream()),
        switchMap((mediaStream) => this.streamSwitchThreshold && this.rtcStreamService.participantCountChanged$.value > this.streamSwitchThreshold
          ? this.awsService.shareVideoFile(mediaStream)
          : this.rtcStreamService.createMediaStreamFromVideo(mediaStream)
        )
      );
  }

  stopSteaming() {
    if (this.rtcStreamService.localStream) {
      this.rtcStreamService.cancelStream();
    } else {
      this.awsService.cancelStream();
    }
    this.hasRemoteStream = false;
  }
}
