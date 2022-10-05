import { Inject, Injectable } from '@angular/core';
import { RtcStreamService } from './rtc-stream.service';
import { STREAM_PUBLISH_DELAY, STREAM_SWITCH_THRESHOLD } from '../tokens';
import { AwsService } from './aws.service';
import { delay, filter, map, Observable, of, Subscription, switchMap, take, takeUntil, tap, zip } from 'rxjs';
import { Stream } from '@apirtc/apirtc';

enum StreamType {
  Aws = 'AWS',
  RTC = 'RTC'
}

@Injectable({
  providedIn: 'root'
})
export class StreamService {

  videoElement: HTMLVideoElement;
  participantsSubscription: Subscription;

  get iAmHost() {
    return !!this.rtcStreamService.localStream || this.awsService.iAmHost;
  }

  localVideoElement: HTMLVideoElement;
  remoteStreams: HTMLElement;

  constructor(public rtcStreamService: RtcStreamService,
    @Inject(STREAM_PUBLISH_DELAY) public publishDelay: number,
    @Inject(STREAM_SWITCH_THRESHOLD) public streamSwitchThreshold: number,
    private awsService: AwsService) {
  }

  init(localVideo: HTMLVideoElement, remoteStreams: HTMLDivElement) {
    this.localVideoElement = localVideo;
    this.remoteStreams = remoteStreams;

    this.localVideoElement.autoplay = true;
    this.localVideoElement.muted = false;

    this.rtcStreamService.createLocalStream()
      .pipe(
        tap((stream: Stream) => {
          stream.attachToElement(this.localVideoElement);
        })
      )
      .subscribe()

    this.awsService.contactsChanged$
      .pipe(
        tap((contacts) => {
          console.log('AWS contacts!!', contacts)
        }),
        // should work when new chime streams are received
        // tap(this.handleStream(StreamType.Aws))
      )
      .subscribe()

    this.rtcStreamService.contactsChanged$
      .pipe(
        tap(() => {
          // should start streaming from Chime in parallel and wait for current RTC stream to be unsubscribed from everyone
          if (this.rtcStreamService.participantsCount > this.streamSwitchThreshold) {
            // this.awsService.startStreaming().subscribe()
          }
        }),
        tap(this.handleStream(StreamType.RTC))
      )
      .subscribe()
  }

  // handles standardized contacts object from both services.
  handleStream = (type: StreamType) => (contacts) => {
    // console.log('contacts', contacts)
    // console.log('Stream', type, contacts, this.rtcStreamService.participantsCount)
    const contactNames = Object.keys(contacts)
    // .filter(key => contacts[key].joined)
    // .filter(key => contacts[key].stream)

    contactNames.forEach(key => {
      const alreadyHas = this.remoteStreams.querySelector(`#stream-${key}`);
      const stream: Stream | MediaStream = contacts[key].stream;
      const tileId = contacts[key].tileId;
      // console.log('all', key, alreadyHas);
      if (alreadyHas && (!contacts[key].joined || !stream)) {
        this.remoteStreams.querySelector(`#stream-${key}`).remove();
      }

      if (contacts[key].joined && stream) {
        const mediaElement = alreadyHas
          ? alreadyHas.querySelector('video')
          : document.createElement('video');
        if (!alreadyHas) {
          const videoContainer = document.createElement('div');
          videoContainer.id = `stream-${key}`;
          videoContainer.classList.add('stream-video')

          mediaElement.autoplay = true;
          mediaElement.muted = false;

          const name = document.createElement('div');
          name.classList.add('name');
          name.innerText = key;

          videoContainer.appendChild(mediaElement);
          videoContainer.appendChild(name);


          this.remoteStreams.appendChild(videoContainer);
        }

        // this.awsService.audioVideo.bindVideoElement()
        if (type === StreamType.Aws) {
          this.awsService.audioVideo.bindVideoElement(tileId, mediaElement)
          // mediaElement.srcObject = stream as MediaStream
        } else {
          (stream as Stream).attachToElement(mediaElement);
        }
        // stream.attachToElement(mediaElement);
      }
    })
  }

  authenticate(name: string) {
    return zip(this.rtcStreamService.getConversation(name),
    this.awsService.authenticate(name)
    )
      .pipe(
        tap(() => {
          // this.awsService.startStreaming().subscribe()
          // this.awsService.audioVideo.startVideoPreviewForVideoInput(this.localVideoElement);
        })
      );
  }

  leave() {
    return this.rtcStreamService.leaveConversation()
      .pipe(
        tap(() => this.awsService.leaveMeeting())
      );
    // if (this.rtcStreamService.localStream) {
    //   return this.rtcStreamService.leaveConversation();
    // } else {
    //   this.awsService.cancelStream();
    //   return of(true)
    // }
  }
}
