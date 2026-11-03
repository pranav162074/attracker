import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { api, useSession } from '../session.tsx';
import { checkEmail, checkReset, normaliseCode, normaliseEmail, problemFrom } from '../lib/forms.ts';
import type { FieldErrors } from '../lib/api.ts';
import { Button } from '../ui/Button.tsx';
import { FormScreen } from '../ui/FormScreen.tsx';
import { ErrorNotice } from '../ui/Notice.tsx';
import { TextField } from '../ui/TextField.tsx';
import { colors, space } from '../ui/theme.ts';

export default function Forgot() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { resetPassword } = useSession();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  const sendCode = async (address: string, again: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      await api.forgotPassword(address);
      setSentTo(address);
      setResent(again);
      if (!again) setFields({});
    } catch (error) {
      const problem = problemFrom(error);
      setFields(problem.fields);
      setMessage(problem.message);
    }
    setBusy(false);
  };

  const askForCode = () => {
    if (busy) return;
    const problem = checkEmail(email);
    setFields(problem ? { email: problem } : {});
    if (problem) return;
    sendCode(normaliseEmail(email), false);
  };

  const submit = async () => {
    if (busy || !sentTo) return;
    const problems = checkReset({ code, password, confirm });
    setFields(problems);
    setMessage(null);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      await resetPassword(sentTo, normaliseCode(code), password);
    } catch (error) {
      const problem = problemFrom(error);
      setFields(problem.fields);
      setMessage(problem.message);
      setBusy(false);
    }
  };

  const startOver = () => {
    setSentTo(null);
    setCode('');
    setPassword('');
    setConfirm('');
    setFields({});
    setMessage(null);
    setResent(false);
  };

  const backToLogin = (
    <View style={styles.footer}>
      <Link href="/login" replace style={styles.link}>
        Back to log in
      </Link>
    </View>
  );

  if (!sentTo) {
    return (
      <FormScreen title="Reset your password" subtitle="Enter the email you use for attracker and we will send you a 6-digit code.">
        <ErrorNotice message={message} />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={fields.email}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          inputMode="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={askForCode}
        />
        <Button title="Send code" onPress={askForCode} busy={busy} />
        {backToLogin}
      </FormScreen>
    );
  }

  return (
    <FormScreen title="Enter the code" subtitle={`If ${sentTo} has an account, a code is on its way. It works for 15 minutes. Check your spam folder if it does not arrive.`}>
      <ErrorNotice message={message} />
      <TextField
        label="Code"
        value={code}
        onChangeText={setCode}
        error={fields.code}
        placeholder="6 digits"
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={7}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="New password"
        value={password}
        onChangeText={setPassword}
        error={fields.password}
        placeholder="At least 8 characters"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <TextField
        ref={confirmRef}
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        error={fields.confirm}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Set new password" onPress={submit} busy={busy} />
      <Text style={styles.note}>Setting a new password logs you out everywhere else.</Text>
      <View style={styles.actions}>
        <Button title={resent ? 'Sent again' : 'Send a new code'} variant="secondary" onPress={() => sendCode(sentTo, true)} busy={busy} />
        <Button title="Use a different email" variant="secondary" onPress={startOver} />
      </View>
      {backToLogin}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: space.xl },
  link: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  note: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: space.md },
  actions: { gap: space.md, marginTop: space.xl },
});
