import assert from 'node:assert/strict'

import { applyOpusStereoPreference, preferLowDelayOpus, setOpusStereoParams } from '../src/lib/webrtc-opus-sdp.ts'

const chromeOffer = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=sendrecv',
  '',
].join('\r\n')

const stereo = applyOpusStereoPreference(chromeOffer, true)
assert.match(stereo, /a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1/)
assert.ok(stereo.includes('\r\n'))

const stripped = applyOpusStereoPreference(stereo, false)
assert.equal(stripped.includes('stereo='), false)
assert.match(stripped, /a=fmtp:111 minptime=10;useinbandfec=1/)

const firefoxOffer = applyOpusStereoPreference(chromeOffer, true)
const unchanged = applyOpusStereoPreference(firefoxOffer, true)
assert.equal(unchanged, firefoxOffer)

const lowDelay = preferLowDelayOpus(stereo)
assert.match(lowDelay, /useinbandfec=0/)
assert.doesNotMatch(lowDelay, /useinbandfec=1/)

assert.equal(setOpusStereoParams('minptime=10;useinbandfec=1;stereo=0', true), 'minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1')
assert.equal(setOpusStereoParams('minptime=10;useinbandfec=1;stereo=1', false), 'minptime=10;useinbandfec=1')

const noFmtp = [
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=rtpmap:111 opus/48000/2',
  '',
].join('\n')
assert.match(applyOpusStereoPreference(noFmtp, true), /a=rtpmap:111 opus\/48000\/2\na=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1/)

console.log('webrtc-opus-sdp tests passed')
