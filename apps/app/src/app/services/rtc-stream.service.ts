import { Inject, Injectable } from '@angular/core';
import { Conversation, Stream, StreamInfo, UserAgent } from '@apirtc/apirtc';
import { BehaviorSubject, from, map, switchMap, tap } from 'rxjs';
import { API_RTC_KEY, STREAM_PUBLISH_DELAY } from '../tokens';
import { cleanOtherContacts } from '../helpers/heplers';

function subscribeToStreamListChange(conversation: Conversation) {
  conversation.on('streamListChanged', (streamInfo: StreamInfo) => {
    // console.log("streamListChanged :", streamInfo);
    if (streamInfo.listEventType === 'added') {
      if (streamInfo.isRemote) {
        conversation.subscribeToMedia('' + streamInfo.streamId)
          .then((stream: any) => {
            // console.log('subscribeToMedia success', stream);
          }).catch((err: any) => {
          // console.error('subscribeToMedia error', err);
        });
      }
    }
  });
}

@Injectable({
  providedIn: 'root'
})
export class RtcStreamService {
  userAgent = new UserAgent({ uri: this.webRtcKey });
  conversation: Conversation = null;

  localStream: Stream;

  contactsChanged$ = new BehaviorSubject<{ [key: string]: { joined: boolean, stream: Stream } }>({});
  participantsCount = 1;
  username = '';

  constructor(
    @Inject(API_RTC_KEY) public webRtcKey: string,
    @Inject(STREAM_PUBLISH_DELAY) public publishDelay: number
  ) {
  }

  createLocalStream() {
    return from(this.userAgent.createStream({
      constraints: {
        audio: false,
        video: true
      }
    }))
      .pipe(
        tap((stream) => this.localStream = stream)
      );
  }

  getConversation(name = '') {
    this.username = name;
    return from(this.userAgent.register({
      id: name
    }))
      .pipe(
        map((session) => session.getConversation('test')),
        tap((conversation) => this.conversation = conversation),
        tap(subscribeToStreamListChange),
        tap(conversation => conversation.on('streamAdded', this.onStreamAdded)),
        tap(conversation => conversation.on('streamRemoved', this.onStreamRemoved)),
        tap(conversation => conversation.on('contactJoined', this.contactEvent(true))),
        tap(conversation => conversation.on('contactLeft', this.contactEvent(false))),
        tap(conversation => conversation.on('customEvent', (e) => {
          // console.log('custom event received', e)
        })),
        switchMap(() => this.conversation.join()),
        switchMap(() => this.conversation.publish(this.localStream)),
        map(() => this.conversation)
      );
  }

  contactEvent = (joined: boolean) => (c) => {
    // console.log('RTC Contact joined', joined);
    console.log('contact event RTC', joined)
    this.participantsCount = this.participantsCount + (joined ? 1 : -1);
    const contacts = this.contactsChanged$.value;
    if (!joined && contacts[c.userData.id]?.joined) {
      this.contactsChanged$.next({
        ...contacts,
        [c.userData.id]: {
          joined: joined,
          stream: null
        }
      });
    }
  };

  onStreamAdded = (stream: Stream) => {
    // console.log('RTC stream Add');
    const userId = stream.getContact().getUserData().get('id');
    const contacts = this.contactsChanged$.value;
    this.contactsChanged$.next({
      ...contacts,
      [userId]: {
        joined: true,
        stream
      }
    });
  };

  onStreamRemoved = (stream: Stream) => {
    // console.log('RTC stream Remove');
    const userId = stream.getContact().getUserData().get('id');
    const contacts = this.contactsChanged$.value;
    if (contacts[userId]?.joined) {
      this.contactsChanged$.next({
        ...contacts,
        [userId]: {
          joined: true,
          stream: null
        }
      });
    }
  };

  unsubscribeToStream(name: string) {
    const stream: Stream = this.contactsChanged$.value?.[name]?.stream;
    if (this.contactsChanged$.value?.[name]?.stream) {
      this.conversation.unsubscribeToStream('' + stream.streamId);
    }
  }

  leaveConversation() {
    this.conversation.unpublish(this.localStream);
    return from(this.conversation.leave())
      .pipe(
        tap(() => this.userAgent.unregister()),
        tap(() => this.conversation = null),
        tap(() => this.contactsChanged$.next(cleanOtherContacts(this.contactsChanged$.value))),
      );
  }
}
