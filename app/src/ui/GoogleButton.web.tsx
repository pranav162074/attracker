import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { googleWebClientId } from '../config.ts';
import { makeStyles, useTheme } from './theme.ts';

type Props = { onToken: (idToken: string) => Promise<void>; onProblem: (message: string) => void };

type Identity = {
  accounts: {
    id: {
      initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void; ux_mode: 'popup'; context: 'signin' }) => void;
      renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
    };
  };
};

const SCRIPT = 'https://accounts.google.com/gsi/client';

let loading: Promise<Identity> | null = null;

const loadIdentity = () => {
  if (loading) return loading;
  loading = new Promise<Identity>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => {
      const google = (window as unknown as { google?: Identity }).google;
      if (google) resolve(google);
      else reject(new Error('missing'));
    };
    script.onerror = () => reject(new Error('blocked'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
};

export const googleAvailable = Boolean(googleWebClientId);

export const GoogleButton = ({ onToken, onProblem }: Props) => {
  const styles = useStyles();
  const { scheme } = useTheme();
  const box = useRef<HTMLElement | null>(null);
  const handlers = useRef({ onToken, onProblem });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    handlers.current = { onToken, onProblem };
  }, [onToken, onProblem]);

  useEffect(() => {
    if (!googleWebClientId) return;
    let active = true;
    loadIdentity()
      .then((google) => {
        const element = box.current;
        if (!active || !element) return;
        google.accounts.id.initialize({
          client_id: googleWebClientId!,
          ux_mode: 'popup',
          context: 'signin',
          callback: (response) => {
            if (response.credential) handlers.current.onToken(response.credential).catch(() => {});
            else handlers.current.onProblem('Google sign-in did not work. Please try again.');
          },
        });
        element.innerHTML = '';
        google.accounts.id.renderButton(element, {
          type: 'standard',
          theme: scheme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.max(200, Math.min(400, Math.floor(element.getBoundingClientRect().width))),
        });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [scheme]);

  if (!googleWebClientId || failed) return null;
  return (
    <View
      ref={(node) => {
        box.current = node as unknown as HTMLElement | null;
      }}
      style={styles.box}
    />
  );
};

const useStyles = makeStyles(() => ({
  box: { width: '100%', minHeight: 44, alignItems: 'center' },
}));
