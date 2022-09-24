import { Component, ElementRef, ViewChild } from '@angular/core';
import { BehaviorSubject, filter, finalize, Observable, switchMap, take } from 'rxjs';
import { StreamService } from './stream.service';
import { Stream } from '@apirtc/apirtc';

@Component({
  selector: 'video-share-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  videoStreamStartLoading = false;
  conversationLoading = false;
  localStream$: Observable<Stream>;

  videoDataLoaded$ = new BehaviorSubject<boolean>(false);

  @ViewChild('player') videoPlayer: ElementRef<HTMLVideoElement>;

  constructor(public streamService: StreamService) {
  }

  ngOnInit() {
  }

  join() {
    this.conversationLoading = true;
    this.streamService.getConversation('test')
      .pipe(
        finalize(() => this.conversationLoading = false)
      )
      .subscribe(c => console.log('cccc', c));
  }

  ngAfterViewInit() {

  }

  onVideoLoadedData(e) {
    this.videoDataLoaded$.next(true);
  }

  startStreamVideo() {
    this.videoStreamStartLoading = true;
    this.localStream$ = this.videoDataLoaded$
      .pipe(
        filter(l => l),
        take(1),
        switchMap(() => this.streamService.createMediaStreamFromVideo(this.videoPlayer.nativeElement)),
        finalize(() => this.videoStreamStartLoading = false)
      );
  }

  cancelStream(stream: Stream) {
    this.streamService.cancelStream(stream);
    this.localStream$ = null;
  }
}
