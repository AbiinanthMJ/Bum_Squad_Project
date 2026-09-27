// Friendly copy for the Supabase auth failures the app can hit. Shared by the
// client sign-up screen, the reviewer login and the client login so every
// surface explains the same problem the same way.
export type AuthErrorLike = { code?: string | null; status?: number | null; message?: string | null }

const codeOf = (error: AuthErrorLike) => error.code || ''
const textOf = (error: AuthErrorLike) => (error.message || '').toLowerCase()

export const isRateLimited = (error: AuthErrorLike) =>
  error.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'].includes(codeOf(error))

export const isEmailNotConfirmed = (error: AuthErrorLike) =>
  codeOf(error) === 'email_not_confirmed' || textOf(error).includes('not confirmed')

export function signUpErrorCopy(error: AuthErrorLike): string {
  if (isRateLimited(error)) return 'The confirmation e-mail service is rate limited right now (free shared limit). Your details are saved — wait 2–3 minutes, then press "Resend confirmation e-mail" below.'
  if (codeOf(error) === 'email_address_invalid') return 'That e-mail address was rejected. Please use a different mailbox.'
  if (codeOf(error) === 'weak_password') return 'Use at least 8 characters, mixing letters and numbers.'
  if (codeOf(error) === 'user_already_exists' || textOf(error).includes('already')) return 'This e-mail is already registered. Use "Sign in to your progress" instead.'
  return 'We could not create your account. Please check your details and try again.'
}

export function signInErrorCopy(error: AuthErrorLike): string {
  if (isEmailNotConfirmed(error)) return 'Your e-mail is not confirmed yet. Open the confirmation link we sent you — or press "Resend confirmation e-mail" below.'
  if (isRateLimited(error)) return 'Too many attempts right now. Wait a minute and try again — your e-mail is kept in the box.'
  return 'Invalid email or password.'
}

export function resendErrorCopy(error: AuthErrorLike): string {
  if (isRateLimited(error)) return 'Still rate limited — give it a few more minutes, then try again. Your e-mail is saved below.'
  return 'We could not send that e-mail. Try again in a moment.'
}

export function authLinkErrorCopy(reason: string): string {
  const clean = reason.replace(/\+/g, ' ')
  return `We could not finish that sign-in link. ${clean}`
}
