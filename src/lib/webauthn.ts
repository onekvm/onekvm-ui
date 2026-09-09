function b64urlToBuf(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function bufToB64url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function reviveCreation(publicKey: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  const user = publicKey.user as Record<string, unknown>
  const exclude = (publicKey.excludeCredentials as Array<Record<string, unknown>> | undefined) || []
  return {
    ...(publicKey as unknown as PublicKeyCredentialCreationOptions),
    challenge: b64urlToBuf(String(publicKey.challenge)),
    user: {
      ...(user as PublicKeyCredentialUserEntity),
      id: b64urlToBuf(String(user.id)),
    },
    excludeCredentials: exclude.map((credential) => ({
      ...(credential as PublicKeyCredentialDescriptor),
      id: b64urlToBuf(String(credential.id)),
    })),
  }
}

function reviveRequest(publicKey: Record<string, unknown>): PublicKeyCredentialRequestOptions {
  const allow = (publicKey.allowCredentials as Array<Record<string, unknown>> | undefined) || []
  return {
    ...(publicKey as unknown as PublicKeyCredentialRequestOptions),
    challenge: b64urlToBuf(String(publicKey.challenge)),
    allowCredentials: allow.map((credential) => ({
      ...(credential as PublicKeyCredentialDescriptor),
      id: b64urlToBuf(String(credential.id)),
    })),
  }
}

function credentialJson(credential: PublicKeyCredential) {
  const response = credential.response
  if (response instanceof AuthenticatorAttestationResponse) {
    return {
      id: credential.id,
      rawId: bufToB64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufToB64url(response.clientDataJSON),
        attestationObject: bufToB64url(response.attestationObject),
      },
    }
  }
  const assertion = response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: bufToB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufToB64url(assertion.clientDataJSON),
      authenticatorData: bufToB64url(assertion.authenticatorData),
      signature: bufToB64url(assertion.signature),
      userHandle: assertion.userHandle ? bufToB64url(assertion.userHandle) : null,
    },
  }
}

function publicKeyFrom(body: unknown) {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  if (record.publicKey && typeof record.publicKey === 'object') return record.publicKey as Record<string, unknown>
  return record
}

export async function createPasskey(challenge: unknown) {
  const publicKey = publicKeyFrom(challenge)
  if (!publicKey) throw new Error('invalid passkey challenge')
  const credential = await navigator.credentials.create({ publicKey: reviveCreation(publicKey) })
  if (!(credential instanceof PublicKeyCredential)) throw new Error('passkey creation was cancelled')
  return credentialJson(credential)
}

export async function getPasskey(challenge: unknown) {
  const publicKey = publicKeyFrom(challenge)
  if (!publicKey) throw new Error('invalid passkey challenge')
  const credential = await navigator.credentials.get({ publicKey: reviveRequest(publicKey) })
  if (!(credential instanceof PublicKeyCredential)) throw new Error('passkey request was cancelled')
  return credentialJson(credential)
}
