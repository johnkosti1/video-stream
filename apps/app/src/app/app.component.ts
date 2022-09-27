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
  loggedIn = false;

  videoDataLoaded$ = new BehaviorSubject<boolean>(false);

  @ViewChild('player') videoPlayer: ElementRef<HTMLVideoElement>;

  selectedSample = new FormControl({ value: 'sample_2.webm', disabled: false });

  constructor(public streamService: StreamService) {
  }

  join() {
    this.conversationLoading = true;
    this.streamService.authenticate()
      .pipe(
        tap(() => this.loggedIn = true),
        finalize(() => this.conversationLoading = false)
      )
      .subscribe();
  }

  leave() {
    this.streamService.leave();
  }

  onVideoLoadedData() {
    this.videoDataLoaded$.next(true);
  }

  startStreamVideo() {
    this.videoStreamStartLoading = true;
    this.streamService.startStreamVideo(this.videoDataLoaded$, this.videoPlayer.nativeElement)
      .pipe(
        tap(() => this.selectedSample.disable()),
        finalize(() => this.videoStreamStartLoading = false)
      )
      .subscribe();
  }

  cancelStream() {
    this.streamService.stopSteaming();
    this.selectedSample.enable();
  }
}
