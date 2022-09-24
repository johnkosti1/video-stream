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

  async shareVideoFile(video: HTMLVideoElement) {
    const mediaStream = await this.playToStream(video);

    console.log('should share', mediaStream)
    await this.audioVideo.startContentShare(mediaStream);
    await this.audioVideo.start();

    this.audioVideo.addObserver({
      videoTileDidUpdate: (tileState: VideoTileState) => {
        console.log('tile did update !!', tileState)
        if (!tileState.boundAttendeeId || tileState.localTile || !!tileState.boundVideoElement) {
          return;
        }

        console.log('PASSED')

        const videoFile = document.getElementById('video-aws') as HTMLVideoElement;
        this.audioVideo.bindVideoElement(tileState.tileId, videoFile);
      }
    });
  }

  async playToStream(videoFile: HTMLVideoElement): Promise<MediaStream> {
    console.log('video filee!!!!')
    await videoFile.play();

    if (this.defaultBrowserBehavior.hasFirefoxWebRTC()) {
      // @ts-ignore
      return videoFile.mozCaptureStream();
    }

    // @ts-ignore
    return videoFile.captureStream();
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
