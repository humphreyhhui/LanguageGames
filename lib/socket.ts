import { io, Socket } from 'socket.io-client';
import { SERVER_URL } from './constants';
import { supabase } from './supabase';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }
  return socket;
}

/**
 * Connect and authenticate via Supabase JWT.
 * The server verifies the token — no client-side trust.
 */
export async function connectAndAuthenticate(): Promise<Socket> {
  const s = getSocket();

  // Get the current session JWT
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated. Please sign in first.');
  }

  s.connect();

  // Send JWT for server-side verification
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Authentication timed out'));
    }, 10000);

    s.emit('authenticate', { token: session.access_token });

    s.once('authenticated', () => {
      clearTimeout(timeout);
      resolve(s);
    });

    s.once('error', (err: { message: string }) => {
      clearTimeout(timeout);
      reject(new Error(err.message));
    });
  });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
