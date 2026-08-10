const FIELD_PRIME = (1n << 255n) - 19n
const A24 = 121665n

function mod(value: bigint) {
  const result = value % FIELD_PRIME
  return result >= 0n ? result : result + FIELD_PRIME
}

function modPow(base: bigint, exponent: bigint) {
  let result = 1n
  let factor = mod(base)
  let power = exponent
  while (power > 0n) {
    if (power & 1n) result = mod(result * factor)
    factor = mod(factor * factor)
    power >>= 1n
  }
  return result
}

function decodeLittleEndian(bytes: Uint8Array) {
  let value = 0n
  for (let index = bytes.length - 1; index >= 0; index--) {
    value = (value << 8n) | BigInt(bytes[index])
  }
  return value
}

function encodeLittleEndian(value: bigint) {
  const bytes = new Uint8Array(32)
  let remaining = value
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
  return bytes
}

function clampPrivateKey(value: Uint8Array) {
  const key = new Uint8Array(value)
  key[0] &= 248
  key[31] &= 127
  key[31] |= 64
  return key
}

// Implements the RFC 7748 X25519 Montgomery ladder for WireGuard key
// generation. It does not depend on WebCrypto X25519, which is unavailable
// when the device UI is opened over plain HTTP in several browsers.
export function wireGuardPublicKey(privateKey: Uint8Array) {
  if (privateKey.length !== 32) throw new Error('WireGuard private keys must contain 32 bytes')
  const scalar = decodeLittleEndian(clampPrivateKey(privateKey))
  const x1 = 9n
  let x2 = 1n
  let z2 = 0n
  let x3 = x1
  let z3 = 1n
  let swap = 0n

  for (let bit = 254; bit >= 0; bit--) {
    const scalarBit = (scalar >> BigInt(bit)) & 1n
    if ((swap ^ scalarBit) !== 0n) {
      ;[x2, x3] = [x3, x2]
      ;[z2, z3] = [z3, z2]
    }
    swap = scalarBit

    const a = mod(x2 + z2)
    const aa = mod(a * a)
    const b = mod(x2 - z2)
    const bb = mod(b * b)
    const e = mod(aa - bb)
    const c = mod(x3 + z3)
    const d = mod(x3 - z3)
    const da = mod(d * a)
    const cb = mod(c * b)
    x3 = mod((da + cb) * (da + cb))
    z3 = mod(x1 * mod((da - cb) * (da - cb)))
    x2 = mod(aa * bb)
    z2 = mod(e * mod(aa + A24 * e))
  }
  if (swap !== 0n) {
    ;[x2, x3] = [x3, x2]
    ;[z2, z3] = [z3, z2]
  }
  return encodeLittleEndian(mod(x2 * modPow(z2, FIELD_PRIME - 2n)))
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

export function wireGuardPublicKeyFromBase64(privateKey: string) {
  let decoded: string
  try {
    decoded = atob(privateKey)
  } catch {
    throw new Error('WireGuard private key is not valid base64')
  }
  if (decoded.length !== 32) throw new Error('WireGuard private keys must contain 32 bytes')
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  return toBase64(wireGuardPublicKey(bytes))
}

export function generateWireGuardKeyPair() {
  const random = globalThis.crypto
  if (!random?.getRandomValues) throw new Error('Secure random number generation is unavailable')
  const privateKey = clampPrivateKey(random.getRandomValues(new Uint8Array(32)))
  const publicKey = wireGuardPublicKey(privateKey)
  return { privateKey: toBase64(privateKey), publicKey: toBase64(publicKey) }
}
