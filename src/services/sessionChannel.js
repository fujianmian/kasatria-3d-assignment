export const SESSION_CHANNEL_NAME = 'kasatria-people-session';

export class SessionChannel {
  constructor({ channelFactory, getSession, onSignOut, requestTimeoutMs = 250 }) {
    this.getSession = getSession;
    this.onSignOut = onSignOut;
    this.requestTimeoutMs = requestTimeoutMs;
    this.pendingRequests = new Map();
    const factory = channelFactory ?? (typeof BroadcastChannel === 'undefined' ? null : (name) => new BroadcastChannel(name));
    this.channel = factory ? factory(SESSION_CHANNEL_NAME) : null;
    if (this.channel) this.channel.onmessage = (event) => this.handleMessage(event.data);
  }

  requestSession() {
    if (!this.channel) return Promise.resolve(null);
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve(null);
      }, this.requestTimeoutMs);
      this.pendingRequests.set(requestId, { resolve, timeoutId });
      this.channel.postMessage({ type: 'session-request', requestId });
    });
  }

  broadcastSignOut() {
    this.channel?.postMessage({ type: 'sign-out' });
  }

  handleMessage(message) {
    if (!message?.type) return;
    if (message.type === 'session-request') {
      const session = this.getSession();
      if (session) this.channel?.postMessage({ type: 'session-response', requestId: message.requestId, session });
      return;
    }
    if (message.type === 'session-response') {
      const pending = this.pendingRequests.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(message.requestId);
      pending.resolve(message.session);
      return;
    }
    if (message.type === 'sign-out') this.onSignOut();
  }

  close() {
    this.pendingRequests.forEach(({ timeoutId, resolve }) => {
      clearTimeout(timeoutId);
      resolve(null);
    });
    this.pendingRequests.clear();
    this.channel?.close();
  }
}
