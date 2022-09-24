import { Component, ElementRef, ViewChild } from '@angular/core';
import { BehaviorSubject, filter, finalize, Observable, switchMap, take, tap } from 'rxjs';
import { StreamService } from './stream.service';
import { Stream } from '@apirtc/apirtc';
import { AwsService } from './aws';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'video-share-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  videoStreamStartLoading = false;
  conversationLoading = false;

  videoDataLoaded$ = new BehaviorSubject<boolean>(false);

  @ViewChild('player') videoPlayer: ElementRef<HTMLVideoElement>;

  selectedSample = new FormControl({ value: 'sample_2.webm', disabled: false });

  constructor(public streamService: StreamService,
    private awsService: AwsService) {
  }

  ngOnInit() {
  }

  join() {
    this.conversationLoading = true;
    this.awsService.authenticate((window as any).user || undefined);
    this.streamService.getConversation('test')
      .pipe(
        finalize(() => this.conversationLoading = false)
      )
      .subscribe();
  }

  ngAfterViewInit() {
  }

  onVideoLoadedData(e) {
    this.videoDataLoaded$.next(true);
  }

  startStreamVideo() {
    this.videoStreamStartLoading = true;
    this.videoDataLoaded$
      .pipe(
        filter(l => l),
        take(1),
        // tap(() => this.awsService.shareVideoFile()),
        switchMap(() => this.streamService.createMediaStreamFromVideo(this.videoPlayer.nativeElement)),
        finalize(() => this.videoStreamStartLoading = false),
        finalize(() => this.selectedSample.disable()),
      )
      .subscribe();
  }

  cancelStream() {
    this.streamService.cancelStream();
    this.selectedSample.enable();
  }
}
