import { useState } from 'react';
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { googleWebClientId } from '../config.ts';
import { Button } from './Button.tsx';

type Props = { onToken: (idToken: string) => Promise<void>; onProblem: (message: string) => void };

let configured = false;

const configure = () => {
  if (configured || !googleWebClientId) return;
  GoogleSignin.configure({ webClientId: googleWebClientId });
  configured = true;
};

export const googleAvailable = Boolean(googleWebClientId);

export const GoogleButton = ({ onToken, onProblem }: Props) => {
  const [busy, setBusy] = useState(false);
  if (!googleWebClientId) return null;

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      configure();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (isSuccessResponse(response)) {
        const idToken = response.data.idToken;
        await GoogleSignin.signOut().catch(() => null);
        if (idToken) await onToken(idToken);
        else onProblem('Google did not send back your sign-in. Please try again.');
      }
    } catch (error) {
      if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) return;
      if (isErrorWithCode(error) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) onProblem('Google Play services are missing or out of date on this phone.');
      else if (!isErrorWithCode(error)) throw error;
      else onProblem('Google sign-in did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <Button title="Continue with Google" variant="secondary" onPress={start} busy={busy} />;
};
