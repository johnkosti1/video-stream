import {
  AudioVideoFacade,
  ConsoleLogger,
  DefaultBrowserBehavior,
  DefaultDeviceController,
  DefaultMeetingSession,
  Logger,
  LogLevel,
  MeetingSession,
  MeetingSessionConfiguration,
  VideoTileState
} from 'amazon-chime-sdk-js';
import { Injectable } from '@angular/core';
import { catchError, from, map, Observable, of, Subject, tap } from 'rxjs';
import { HttpClient } from '@angular/common/http';

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

  constructor(private httpClient: HttpClient) {
  }

  async shareVideoFile(mediaStream: MediaStream) {
    this.iAmHost = true;
    return from(this.audioVideo.startContentShare(mediaStream))
      .pipe(
        catchError(() => {
          this.iAmHost = false;
          return of(null);
        })
      );
  }

  cancelStream() {
    this.audioVideo.stopContentShare();
    this.iAmHost = false;
  }

  authenticate(user: string = 'john'): Observable<any> {
    return this.sendJoinRequest(user)
      .pipe(
        map(({ JoinInfo }) => JoinInfo),
        map((joinInfo) => new MeetingSessionConfiguration(joinInfo.Meeting, joinInfo.Attendee)),
        tap((configuration) => this.initializeMeetingSession(configuration))
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

    this.audioVideo.addObserver({
      videoTileWasRemoved: (tileId: number) => {
        this.remoteStreamAdded$.next(false);
      },
      videoTileDidUpdate: (tileState: VideoTileState) => {
        if (!tileState.boundAttendeeId || tileState.localTile || !!tileState.boundVideoElement) {
          return;
        }

        if (this.iAmHost) {
          return;
        }

        this.remoteStreamAdded$.next(true);

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
