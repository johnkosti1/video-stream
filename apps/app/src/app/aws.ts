import {
  AudioVideoFacade,
  ConsoleLogger,
  DefaultBrowserBehavior,
  DefaultDeviceController,
  DefaultMeetingSession,
  EventReporter,
  Logger,
  LogLevel,
  MeetingSession,
  MeetingSessionConfiguration,
  POSTLogger, VideoTileState
} from 'amazon-chime-sdk-js';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export let fatal: (e: Error) => void;

@Injectable({
  providedIn: 'root'
})
export class AwsService {
  static readonly BASE_URL: string = [
    location.protocol,
    '//',
    location.host,
    location.pathname.replace(/\/*$/, '/').replace('/v2', ''),
  ].join('');

  defaultBrowserBehavior: DefaultBrowserBehavior = new DefaultBrowserBehavior();
  audioVideo: AudioVideoFacade | null = null;
  meetingSession: MeetingSession | null = null;
  meetingLogger: Logger | undefined = undefined;
  logLevel = LogLevel.WARN;
  deviceController: DefaultDeviceController | undefined = undefined;
  enableWebAudio = false;
  joinInfo: any | undefined;
  region: string | null = null;
  primaryExternalMeetingId: string | undefined = undefined;

  remoteStreamAdded$ = new Subject<boolean>();

  iAmHost = false;

  async shareVideoFile(mediaStream: MediaStream) {
    await this.audioVideo.startContentShare(mediaStream);
    this.iAmHost = true;
  }

  cancelStream() {
    this.audioVideo.stopContentShare();
    this.iAmHost = false;
  }

  async authenticate(user: string = 'john'): Promise<string> {
    this.joinInfo = (await this.sendJoinRequest('test', user, '')).JoinInfo;
    this.region = this.joinInfo.Meeting.Meeting.MediaRegion;
    const configuration = new MeetingSessionConfiguration(this.joinInfo.Meeting, this.joinInfo.Attendee);
    await this.initializeMeetingSession(configuration);
    this.primaryExternalMeetingId = this.joinInfo.PrimaryExternalMeetingId;

    return configuration.meetingId;
  }

  async initializeMeetingSession(configuration: MeetingSessionConfiguration): Promise<void> {
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
        console.log('updaye !!!!!')
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
        }, 1000)
      }
    });
  }

  async sendJoinRequest(
    meeting: string,
    name: string,
    region: string,
    primaryExternalMeetingId?: string): Promise<any> {
    let uri = `http://127.0.0.1:5000/join?title=${encodeURIComponent(
      meeting
    )}&name=${encodeURIComponent(name)}&region=${encodeURIComponent('us-east-1')}`;
    if (primaryExternalMeetingId) {
      uri += `&primaryExternalMeetingId=${primaryExternalMeetingId}`;
    }
    uri += ``;
    const response = await fetch(uri,
      {
        method: 'POST',
      }
    );
    const json = await response.json();
    if (json.error) {
      throw new Error(`Server error: ${json.error}`);
    }
    return json;
  }
}
