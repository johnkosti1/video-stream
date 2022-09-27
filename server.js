// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const AWS = require('aws-sdk');
const compression = require('compression');
const fs = require('fs');
const http = require('http');
const url = require('url');
const { v4: uuidv4 } = require('uuid');

// Store created meetings in a map so attendees can join by meeting title.
const meetingTable = {};

// Load the contents of the web application to be used as the index page.
const app = process.env.npm_config_app || 'meetingV2';
const indexPagePath = `dist/${app}.html`;

console.info('Using index path', indexPagePath);

// const indexPage = fs.readFileSync(indexPagePath);

// Set the AWS SDK Chime endpoint. The Chime endpoint is https://service.chime.aws.amazon.com.
const endpoint = process.env.ENDPOINT || 'https://service.chime.aws.amazon.com';
const currentRegion = process.env.REGION || 'us-east-1';
const useChimeSDKMeetings = process.env.USE_CHIME_SDK_MEETINGS || 'true';

// Create ans AWS SDK Chime object. Region 'us-east-1' is globally available..
// Use the MediaRegion property below in CreateMeeting to select the region
// the meeting is hosted in.
const chime = new AWS.Chime({ region: 'us-east-1' });

const chimeSDKMediaPipelinesRegional = new AWS.ChimeSDKMediaPipelines({region: 'us-east-1'});
chimeSDKMediaPipelinesRegional.endpoint = process.env.CHIME_SDK_MEDIA_PIPELINES_ENDPOINT || "https://media-pipelines-chime.us-east-1.amazonaws.com"
chime.endpoint = endpoint;

const chimeSDKMeetings = new AWS.ChimeSDKMeetings({ region: currentRegion });
if (endpoint !== 'https://service.chime.aws.amazon.com') {
  chimeSDKMeetings.endpoint = endpoint;
}

const sts = new AWS.STS({ region: 'us-east-1' })

const captureS3Destination = process.env.CAPTURE_S3_DESTINATION;
if (captureS3Destination) {
  console.info(`S3 destination for capture is ${captureS3Destination}`)
} else {
  console.info(`S3 destination for capture not set.  Cloud media capture will not be available.`)
}

const ivsEndpoint = process.env.IVS_ENDPOINT;
if (ivsEndpoint) {
  console.info(`IVS destination for live connector is ${ivsEndpoint}`)
} else {
  console.info(`IVS destination for live connector not set. Live Connector will not be available.`)
}

// return Chime Meetings SDK Client just for Echo Reduction for now.
function getClientForMeeting(meeting) {
  return useChimeSDKMeetings === "true" ||
  (meeting &&
      meeting.Meeting &&
      meeting.Meeting.MeetingFeatures &&
      meeting.Meeting.MeetingFeatures.Audio &&
      meeting.Meeting.MeetingFeatures.Audio.EchoReduction === "AVAILABLE")
      ? chimeSDKMeetings
      : chime;
}

function serve(host = '127.0.0.1:5000') {
  // Start an HTTP server to serve the index page and handle meeting actions
  http.createServer({}, async (request, response) => {

    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Request-Method', '*');
    response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
    response.setHeader('Access-Control-Allow-Headers', '*');

    if ( request.method === 'OPTIONS' ) {
      response.writeHead(200);
      response.end();
      return;
    }

    log(`${request.method} ${request.url} BEGIN`);
    try {
      // Enable HTTP compression
      compression({})(request, response, () => {});
      const requestUrl = url.parse(request.url, true);
      if (request.method === 'POST' && requestUrl.pathname === '/join') {
        if (!requestUrl.query.title || !requestUrl.query.name) {
          respond(response, 400, 'application/json', JSON.stringify({ error: 'Need parameters: title and name' }));
        }
        const meetingIdFormat = /^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/
        let meeting = meetingTable[requestUrl.query.title];

        let client = getClientForMeeting(meeting);

        let primaryMeeting = undefined
        if (requestUrl.query.primaryExternalMeetingId) {
          primaryMeeting = meetingTable[requestUrl.query.primaryExternalMeetingId]
          if (primaryMeeting) {
            console.info(`Retrieved primary meeting ID ${primaryMeeting.Meeting.MeetingId} for external meeting ID ${requestUrl.query.primaryExternalMeetingId}`)
          } else if (meetingIdFormat.test(requestUrl.query.primaryExternalMeetingId)) {
            // Just in case, check if we were passed a regular meeting ID instead of an external ID
            try {
              primaryMeeting = await client.getMeeting({
                MeetingId: requestUrl.query.primaryExternalMeetingId
              }).promise();
              if (primaryMeeting !== undefined) {
                console.info(`Retrieved primary meeting id ${primaryMeeting.Meeting.MeetingId}`);
                await putMeeting(requestUrl.query.primaryExternalMeetingId, primaryMeeting);
              }
            } catch (error) {
              console.info("Meeting ID doesnt' exist as a conference ID: " + error);
            }
          }
          if (!primaryMeeting) {
            respond(response, 400, 'application/json', JSON.stringify({ error: 'Primary meeting has not been created' }));
          }
        }

        if (!meeting) {
          if (!requestUrl.query.region) {
            respond(response, 400, 'application/json', JSON.stringify({ error: 'Need region parameter set if meeting has not yet been created' }));
          }
          // If the meeting does not exist, check if we were passed in a meeting ID instead of an external meeting ID.  If so, use that one
          try {
            if (meetingIdFormat.test(requestUrl.query.title)) {
              meeting = await client.getMeeting({
                MeetingId: requestUrl.query.title
              }).promise();
            }
          } catch (error) {
            console.info("Meeting ID doesn't exist as a conference ID: " + error);
          }

          // If still no meeting, create one
          if (!meeting) {
            let request = {
              // Use a UUID for the client request token to ensure that any request retries
              // do not create multiple meetings.
              ClientRequestToken: uuidv4(),
              // Specify the media region (where the meeting is hosted).
              // In this case, we use the region selected by the user.
              MediaRegion: requestUrl.query.region,
              // Any meeting ID you wish to associate with the meeting.
              // For simplicity here, we use the meeting title.
              ExternalMeetingId: requestUrl.query.title.substring(0, 64),
            };
            if (primaryMeeting !== undefined) {
              request.PrimaryMeetingId = primaryMeeting.Meeting.MeetingId;
            }
            if (requestUrl.query.ns_es === 'true') {
              client = chimeSDKMeetings;
              request.MeetingFeatures = {
                Audio: {
                  // The EchoReduction parameter helps the user enable and use Amazon Echo Reduction.
                  EchoReduction: 'AVAILABLE'
                }
              };
            }
            console.info('Creating new meeting: ' + JSON.stringify(request));
            meeting = await client.createMeeting(request).promise();

            // Extend meeting with primary external meeting ID if it exists
            if (primaryMeeting !== undefined) {
              meeting.Meeting.PrimaryExternalMeetingId = primaryMeeting.Meeting.ExternalMeetingId;
            }
          }

          // Store the meeting in the table using the meeting title as the key.
          meetingTable[requestUrl.query.title] = meeting;
        }

        // Create new attendee for the meeting
        const attendee = await client.createAttendee({
          // The meeting ID of the created meeting to add the attendee to
          MeetingId: meeting.Meeting.MeetingId,

          // Any user ID you wish to associate with the attendeee.
          // For simplicity here, we use a random id for uniqueness
          // combined with the name the user provided, which can later
          // be used to help build the roster.
          ExternalUserId: `${uuidv4().substring(0, 8)}#${requestUrl.query.name}`.substring(0, 64),
        }).promise();

        // Return the meeting and attendee responses. The client will use these
        // to join the meeting.
        let joinResponse = {
          JoinInfo: {
            Meeting: meeting,
            Attendee: attendee,
          },
        }
        if (meeting.Meeting.PrimaryExternalMeetingId !== undefined) {
          // Put this where it expects it, since it is not technically part of create meeting response
          joinResponse.JoinInfo.PrimaryExternalMeetingId = meeting.Meeting.PrimaryExternalMeetingId;
        }
        respond(response, 201, 'application/json', JSON.stringify(joinResponse, null, 2));
      } else if (request.method === 'POST' && requestUrl.pathname === '/end') {
        // End the meeting. All attendee connections will hang up.
        let client = getClientForMeeting(meetingTable[requestUrl.query.title]);
        await client.deleteMeeting({
          MeetingId: meetingTable[requestUrl.query.title].Meeting.MeetingId,
        }).promise();
        respond(response, 200, 'application/json', JSON.stringify({}));
      } else if (request.method === 'POST' && requestUrl.pathname === '/startCapture') {
        if (captureS3Destination) {
          const callerInfo = await sts.getCallerIdentity().promise()
          pipelineInfo = await chime.createMediaCapturePipeline({
            SourceType: "ChimeSdkMeeting",
            SourceArn: `arn:aws:chime::${callerInfo.Account}:meeting:${meetingTable[requestUrl.query.title].Meeting.MeetingId}`,
            SinkType: "S3Bucket",
            SinkArn: captureS3Destination,
          }).promise();
          meetingTable[requestUrl.query.title].Capture = pipelineInfo.MediaCapturePipeline;
          respond(response, 201, 'application/json', JSON.stringify(pipelineInfo));
        } else {
          console.warn("Cloud media capture not available")
          respond(response, 500, 'application/json', JSON.stringify({}))
        }
      } else if (request.method === 'POST' && requestUrl.pathname === '/end') {
        // End the meeting. All attendee connections will hang up.
        let client = getClientForMeeting(meetingTable[requestUrl.query.title]);

        await client.deleteMeeting({
          MeetingId: meetingTable[requestUrl.query.title].Meeting.MeetingId,
        }).promise();
        respond(response, 200, 'application/json', JSON.stringify({}));
      } else if (request.method === 'GET' && requestUrl.pathname === '/fetch_credentials') {
        const awsCredentials = {
          accessKeyId: AWS.config.credentials.accessKeyId,
          secretAccessKey: AWS.config.credentials.secretAccessKey,
          sessionToken: AWS.config.credentials.sessionToken,
        };
        respond(response, 200, 'application/json', JSON.stringify(awsCredentials), true);
      } else {
        respond(response, 404, 'text/html', '404 Not Found');
      }
    } catch (err) {
      respond(response, 400, 'application/json', JSON.stringify({ error: err.message }, null, 2));
    }
    log(`${request.method} ${request.url} END`);
  }).listen(host.split(':')[1], host.split(':')[0], () => {
    log(`server running at http://${host}/`);
  });
}

function log(message) {
  console.log(`${new Date().toISOString()} ${message}`);
}

function respond(response, statusCode, contentType, body, skipLogging = false) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.end(body);
  if (contentType === 'application/json' && !skipLogging) {
    log(body);
  }
}

serve();
