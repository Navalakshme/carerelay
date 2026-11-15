import { art } from '../artwork.mjs';
import { html, esc, btn, field } from './components.mjs';

export function createAccountViews(getState) {
  function authMarkup() {
    const { authMode } = getState();
    return html`<div class="auth-layout">
      <section class="auth-story">
        <div class="brand">Care<b>Relay</b></div>
        <div>
          <div class="eyebrow">A little care, shared</div>
          <h2>Care feels lighter<br />when you carry it together.</h2>
          <p>One private circle. A clear record.<br />A little more peace of mind.</p>
          ${art()}
        </div>
        <a href="/demo.html">Explore the fictional demo &rarr;</a>
      </section>
      <main class="auth-main" id="main" tabindex="-1">
        <div class="auth-box">
          <span class="pill">Your circle starts here</span>
          <h1>
            ${authMode === 'recovery' ? 'Set a new password' : authMode === 'recover' ? 'Reset your password' : authMode === 'sign-up' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p class="subtitle">
            ${authMode === 'sign-up' ? 'Create or join a private care circle.' : 'Sign in to see your shared care records.'}
          </p>
          <p id="page-error" class="form-error" role="alert"></p>
          <form data-form="auth">
            ${authMode === 'sign-up' ? field('name', 'Your display name', 'required maxlength="80" autocomplete="name"') : ''}${authMode !== 'recovery' ? field('email', 'Email address', 'type="email" required maxlength="254" autocomplete="email"') : ''}${authMode !== 'recover' ? field('password', 'Password', `type="password" required ${['sign-up', 'recovery'].includes(authMode) ? 'minlength="12"' : ''} maxlength="128" autocomplete="${['sign-up', 'recovery'].includes(authMode) ? 'new-password' : 'current-password'}"`) : ''}${authMode === 'sign-up' ? '<p class="tiny">Use at least 12 characters. Confirm your email before signing in.</p>' : ''}<button
              class="primary full auth-submit"
              type="submit"
            >
              ${authMode === 'recovery' ? 'Save new password' : authMode === 'recover' ? 'Send recovery link' : authMode === 'sign-up' ? 'Create account' : 'Sign in'}
            </button>
          </form>
          ${btn('recover', 'Forgot password?', '', 'small quiet')}
          <p class="auth-switch">
            ${authMode === 'sign-up' ? 'Already have an account?' : 'New to CareRelay?'}
            ${btn('auth-mode', authMode === 'sign-up' ? 'Sign in' : 'Create account', '', 'small quiet')}
          </p>
          <p class="tiny">
            Email confirmation stays enabled. Invitation codes work only after sign-in.
          </p>
          <div class="note">
            Private circles, shared reports and elder-approved plans. Reminders appear in your
            in-app inbox; external email and emergency monitoring are not connected.
          </div>
        </div>
      </main>
    </div>`;
  }
  function onboardingScreen() {
    const { user, onboarding, circles } = getState();
    return html`<main class="onboarding" id="main" tabindex="-1">
      <div class="page-title">
        <div>
          <div class="eyebrow">Welcome, ${esc(user.name)}</div>
          <h1>A circle of your own</h1>
          <p class="subtitle">Create your circle as its elder owner, or join with an invitation.</p>
        </div>
        ${btn('sign-out', 'Sign out')}
      </div>
      <section class="card">
        <div class="actions">
          ${btn('onboard-create', 'Create my care circle', '', onboarding === 'create' ? 'primary' : '')}${btn('onboard-join', 'Join a circle', '', onboarding === 'join' ? 'primary' : '')}
        </div>
        <p id="page-error" class="form-error" role="alert"></p>
        ${
          onboarding === 'create'
            ? html`<form data-form="create-circle">
                ${field('circleName', 'Circle name', 'required maxlength="80" placeholder="My care circle"')}${field('displayName', 'Your name as elder / circle owner', `required maxlength="80" value="${esc(user.name)}"`)}<label
                  for="timezone"
                  >Care schedule timezone</label
                ><select name="timezone" id="timezone">
                  <option value="Asia/Kolkata">India - Asia/Kolkata</option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="America/New_York">America/New_York</option>
                </select>
                <p class="tiny">
                  You control membership and approvals. This circle starts empty, without example
                  medication data.
                </p>
                <button type="submit" class="primary">Create private circle</button>
              </form>`
            : html`<form data-form="join">
                ${field('displayName', 'Your display name', `required maxlength="80" value="${esc(user.name)}"`)}${field('token', 'Invitation code', 'required minlength="64" maxlength="64" autocomplete="off" spellcheck="false"')}
                <p class="tiny">
                  Ask the elder owner for a code privately. Each code expires in 24 hours and works
                  once.
                </p>
                <button type="submit" class="primary">Join circle</button>
              </form>`
        }
      </section>
      ${circles.length ? btn('back-circle', 'Back to my circle', '', 'quiet') : ''}
    </main>`;
  }
  return { authMarkup, onboardingScreen };
}
