

# VideoShare

This project was generated using [Nx](https://nx.dev).

<p style="text-align: center;"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="450"></p>

## Start application

Run `yarn aws:serve` to run Amazon chime server. You need to provide keys for it.

Run `yarn serve` to run Front-End application. It will run the application on http://localhost:4200

Application has join button, which starts both, `ApiRtc` and `Chime` sessions.

If users count is greater than `RTC` threshold, it will start `Chime` automatically. 
If users count will exceed threshold during the stream, it will switch to `Chime`.
