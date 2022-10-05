import { Component, ElementRef, ViewChild } from '@angular/core';
import { BehaviorSubject, finalize, tap } from 'rxjs';
import { FormControl } from '@angular/forms';
import { StreamService } from './services/stream.service';

@Component({
  selector: 'video-share-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  videoStreamStartLoading = false;
  conversationLoading = false;
  leaveLoading = false;
  loggedIn = false;

  videoDataLoaded$ = new BehaviorSubject<boolean>(false);

  @ViewChild('player') videoPlayer: ElementRef<HTMLVideoElement>;
  @ViewChild('localVideo', { static: true }) localVideo: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteStreams', { static: true }) remoteStreams: ElementRef<HTMLDivElement>;

  constructor(public streamService: StreamService) {
  }

  ngOnInit() {
    this.streamService.init(this.localVideo.nativeElement, this.remoteStreams.nativeElement);
  }

  join(name: string) {
    this.conversationLoading = true;
    this.streamService.authenticate(name)
      .pipe(
        tap(() => this.loggedIn = true),
        finalize(() => this.conversationLoading = false)
      )
      .subscribe();
  }

  onVideoLoadedData() {
    this.videoDataLoaded$.next(true);
  }

  leaveConversation() {
    this.leaveLoading = true;
    this.streamService.leave()
      .pipe(
        tap(() => this.loggedIn = false),
        tap(() => this.leaveLoading = false)
      )
      .subscribe()
  }
}
