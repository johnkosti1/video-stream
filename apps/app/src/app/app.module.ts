import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { AppComponent } from './app.component';
import { STREAM_PUBLISH_DELAY, API_RTC_KEY, STREAM_SWITCH_THRESHOLD } from './tokens';
import { environment } from '../environments/environment';
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    FormsModule, ReactiveFormsModule,
    BrowserAnimationsModule, MatFormFieldModule, MatInputModule,
    HttpClientModule
  ],
  providers: [
    {
      provide: API_RTC_KEY,
      useValue: `apiKey:${environment.apiRtcKey}`
    },
    {
      provide: STREAM_PUBLISH_DELAY,
      useValue: environment.streamPublishDelay
    },
    {
      provide: STREAM_SWITCH_THRESHOLD,
      useValue: environment.streamSwitchThreshold
    },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
