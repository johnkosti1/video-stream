import { Inject, Injectable } from '@angular/core';
import { RtcStreamService } from './rtc-stream.service';
import { STREAM_PUBLISH_DELAY, STREAM_SWITCH_THRESHOLD } from '../tokens';
import { AwsService } from './aws.service';
import { delay, filter, map, Observable, of, Subscription, switchMap, take, takeUntil, tap, zip } from 'rxjs';
import { Stream } from '@apirtc/apirtc';

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
  remoteStreamsAmazon: HTMLElement;

  constructor(public rtcStreamService: RtcStreamService,
    @Inject(STREAM_PUBLISH_DELAY) public publishDelay: number,
    @Inject(STREAM_SWITCH_THRESHOLD) public streamSwitchThreshold: number,
    private awsService: AwsService) {
  }

  init(localVideo: HTMLVideoElement, remoteStreams: HTMLDivElement, amazon: HTMLDivElement) {
    this.localVideoElement = localVideo;
    this.remoteStreams = remoteStreams;
    this.remoteStreamsAmazon = amazon;

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
        tap(contacts => {
          // console.log('contacts', contacts)
          const contactNames = Object.keys(contacts)
          // .filter(key => contacts[key].joined)
          // .filter(key => contacts[key].stream)

          contactNames.forEach(key => {
            const alreadyHas = this.remoteStreams.querySelector(`#stream-${key}`);
            const stream = contacts[key].stream;
            const tileId = contacts[key].tileId;
            // console.log('all', key, alreadyHas);
            if (alreadyHas && (!contacts[key].joined || !stream)) {
              this.remoteStreams.querySelector(`#stream-${key}`).remove();
            }

            if (!alreadyHas && contacts[key].joined && stream) {
              const videoContainer = document.createElement('div');
              videoContainer.id = `stream-${key}`;
              videoContainer.classList.add('stream-video')

              const mediaElement = document.createElement('video');
              mediaElement.autoplay = true;
              mediaElement.muted = false;

              const name = document.createElement('div');
              name.classList.add('name');
              name.innerText = key;

              videoContainer.appendChild(mediaElement);
              videoContainer.appendChild(name);


              this.remoteStreams.appendChild(videoContainer);

              // this.awsService.audioVideo.bindVideoElement()
              mediaElement.srcObject = stream
              // stream.attachToElement(mediaElement);
            }
          })
        })
      )
      .subscribe()

    this.rtcStreamService.contactsChanged$
      .pipe(
        // tap(contacts => {
        //   // console.log('contacts', contacts)
        //   const contactNames = Object.keys(contacts)
        //     // .filter(key => contacts[key].joined)
        //     // .filter(key => contacts[key].stream)
        //
        //   contactNames.forEach(key => {
        //     const alreadyHas = this.remoteStreams.querySelector(`#stream-${key}`);
        //     const stream = contacts[key].stream
        //     // console.log('all', key, alreadyHas);
        //     if (alreadyHas && (!contacts[key].joined || !stream)) {
        //       this.remoteStreams.querySelector(`#stream-${key}`).remove();
        //     }
        //
        //     if (!alreadyHas && contacts[key].joined && stream) {
        //       const videoContainer = document.createElement('div');
        //       videoContainer.id = `stream-${key}`;
        //       videoContainer.classList.add('stream-video')
        //
        //       const mediaElement = document.createElement('video');
        //       mediaElement.autoplay = true;
        //       mediaElement.muted = false;
        //
        //       const name = document.createElement('div');
        //       name.classList.add('name');
        //       name.innerText = key;
        //
        //       videoContainer.appendChild(mediaElement);
        //       videoContainer.appendChild(name);
        //
        //
        //       this.remoteStreams.appendChild(videoContainer);
        //
        //       stream.attachToElement(mediaElement);
        //     }
        //   })
        // })
      )
      .subscribe()
  }

  authenticate(name: string) {
    return zip(this.rtcStreamService.getConversation(name),
    this.awsService.authenticate(name)
    )
      .pipe(
        // tap(() => {
        //   this.awsService.audioVideo.startVideoPreviewForVideoInput(this.localVideoElement);
        // })
      );
  }

  leave() {
    return this.rtcStreamService.leaveConversation();
    // if (this.rtcStreamService.localStream) {
    //   return this.rtcStreamService.leaveConversation();
    // } else {
    //   this.awsService.cancelStream();
    //   return of(true)
    // }
  }
}
