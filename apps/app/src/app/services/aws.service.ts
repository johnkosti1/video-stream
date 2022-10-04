import {
  AudioVideoFacade,
  ConsoleLogger,
  DefaultBrowserBehavior,
  DefaultDeviceController,
  DefaultMeetingSession, EventAttributes, EventName,
  Logger,
  LogLevel,
  MeetingSession,
  MeetingSessionConfiguration,
  VideoTileState
} from 'amazon-chime-sdk-js';
import { Injectable } from '@angular/core';
import { BehaviorSubject, catchError, from, map, Observable, of, Subject, switchMap, tap } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Stream } from '@apirtc/apirtc';

export let fatal: (e: Error) => void;

@Injectable({
  providedIn: 'root'
})
export class AwsService {
  defaultBrowserBehavior: DefaultBrowserBehavior = new DefaultBrowserBehavior();
  audioVideo: AudioVideoFacade | null = null;
  meetingSession: MeetingSession | null = null;
  meetingLogger: Logger | undefined = undefined;
  logLevel = LogLevel.WARN;
  deviceController: DefaultDeviceController | undefined = undefined;
  enableWebAudio = false;

  remoteStreamAdded$ = new Subject<boolean>();

  iAmHost = false;

  meetingTitle = 'test';
  username = '';

  localStream: MediaStream;

  contactsChanged$ = new BehaviorSubject<{ [key: string]: { joined: boolean, stream: MediaStream, tileId?: number } }>({});

  constructor(private httpClient: HttpClient) {
  }

  shareVideoFile() {
    // this.audioVideo.realtimeSendDataMessage('yyyyy', 'asasss')
    return from(this.audioVideo.startContentShare(this.localStream))
  }

  cancelStream() {
    this.audioVideo.stopContentShare();
    this.iAmHost = false;
  }

  authenticate(user: string = 'john'): Observable<any> {
    this.username = user;
    return this.sendJoinRequest(user)
      .pipe(
        map(({ JoinInfo }) => JoinInfo),
        map((joinInfo) => new MeetingSessionConfiguration(joinInfo.Meeting, joinInfo.Attendee)),
        tap((configuration) => this.initializeMeetingSession(configuration)),
        switchMap(() => this.audioVideo.listVideoInputDevices()),
        switchMap((devices) => this.audioVideo.startVideoInput(devices[0])),
        tap((stream) => this.localStream = stream),
        switchMap(() => this.shareVideoFile()),
      );
  }


  initializeMeetingSession(configuration: MeetingSessionConfiguration) {
    this.meetingLogger = new ConsoleLogger('SDK', this.logLevel);
    this.deviceController = new DefaultDeviceController(this.meetingLogger, {
      enableWebAudio: this.enableWebAudio,
    });

    this.meetingSession = new DefaultMeetingSession(
      configuration,
      this.meetingLogger,
      this.deviceController
    );

    this.audioVideo = this.meetingSession.audioVideo;
    this.audioVideo.start();

    this.audioVideo.realtimeSubscribeToReceiveDataMessage('test', (a) => {
      // console.log('AWS meessage received', new TextDecoder().decode(a.data))
    })

    // setTimeout(() => {
    //   // this.meetingSession.eventController.publishEvent('testEvent' as any, { test: 122} as any)
    //   this.audioVideo.realtimeSendDataMessage('test', this.username)
    // }, 7000)

    this.audioVideo.realtimeSubscribeToAttendeeIdPresence((id, present, externalUserId) => {
      const contactName = externalUserId.split('#')[1];
      const contacts = this.contactsChanged$.value;
      // const shouldUpdateContacts = contacts[contactName]?.joined !== present
      if (contactName !== this.username && !present) {
        console.log('new contact iddd', id, present, externalUserId)
        this.contactsChanged$.next({
          ...contacts,
          [contactName]: {
            joined: false,
            stream: null
          }
        })
      }
    });

    this.meetingSession.eventController.addObserver({
      eventDidReceive(name: EventName, attributes: EventAttributes) {
        // console.log('AWS EVENT', name, attributes)
      }
    })

    // this.meetingSession.audioVideo.addContentShareObserver()
    this.meetingSession.audioVideo.addContentShareObserver({
      contentShareDidStart() {
        // console.log('AWS START!')
      },
      contentShareDidStop() {
        // console.log('AWS STOPPED!')
      }
    })

    this.audioVideo.addObserver({
      videoTileWasRemoved: (tileId: number) => {
        // console.log('AWS REMOVE video TILE!')
        console.log('tile was removed!!!', tileId)
      },
      videoTileDidUpdate: (tileState: VideoTileState) => {
        // console.log('AWS video tile', tileState)
        if (!tileState.boundExternalUserId) {
          return;
        }

        const contactName = tileState.boundExternalUserId.split('#')[1];

        if (
          this.username === contactName
          || !tileState.boundAttendeeId
          || tileState.localTile
          || !!tileState.boundVideoElement
        ) {
          return;
        }

        // cancel your stream
        // if (contactName === 'one') {
        //   setTimeout(() => {
        //     this.audioVideo.stopContentShare()
        //   }, 10000)
        // }

        const contacts = this.contactsChanged$.value;
        this.contactsChanged$.next({
          ...contacts,
          [contactName]: {
            joined: true,
            stream: tileState.boundVideoStream,
            tileId: tileState.tileId
          }
        })

        // setTimeout(() => {
        //   this.audioVideo.removeVideoTile(tileState.tileId)
        // }, 5000)

        console.log('AWS tile did update', tileState)
        return;

        setTimeout(() => {
          const videoFile = document.getElementById('video-aws') as HTMLVideoElement;
          this.audioVideo.bindVideoElement(tileState.tileId, videoFile);
        }, 300);
      }
    });
  }

  sendJoinRequest(name: string): Observable<any> {
    return this.httpClient.post('http://localhost:5000/join', {}, {
      params: {
        title: this.meetingTitle,
        name,
        region: 'us-east-1',
      }
    });
  }

  leaveMeeting(): Observable<any> {
    return this.httpClient.post('http://localhost:5000/end',
      {},
      { params: { title: this.meetingTitle } }
    );
  }
}
