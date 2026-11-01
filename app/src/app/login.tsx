import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { Link } from 'expo-router';
import { useSession } from '../session.tsx';
import { checkLogin, normaliseEmail, problemFrom } from '../lib/forms.ts';
import type { FieldErrors } from '../lib/api.ts';
import { Button } from '../ui/Button.tsx';
import { FormScreen } from '../ui/FormScreen.tsx';
import { ErrorNotice } from '../ui/Notice.tsx';
import { TextField } from '../ui/TextField.tsx';
import { colors, space } from '../ui/theme.ts';

export default function Login() {
  const { logIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    if (busy) return;
    const problems = checkLogin({ email, password });
    setFields(problems);
    setMessage(null);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      await logIn(normaliseEmail(email), password);
    } catch (error) {
      const problem = problemFrom(error);
      setFields(problem.fields);
      setMessage(problem.message);
      setBusy(false);
    }
  };

  return (
    <FormScreen title="Log in" subtitle="Welcome back.">
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
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={fields.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Log in" onPress={submit} busy={busy} />
      <View style={styles.footer}>
        <Text style={styles.footerText}>New to attracker? </Text>
        <Link href="/signup" replace style={styles.link}>
          Create an account
        </Link>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: space.xl },
  footerText: { color: colors.muted, fontSize: 15 },
  link: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});
