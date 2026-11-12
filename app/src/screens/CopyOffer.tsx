import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, space } from '../ui/theme.ts';

export const CopyOffer = () => {
  const router = useRouter();
  return (
    <Pressable role="button" onPress={() => router.push('/timetables/copy')} style={({ pressed }) => [styles.box, pressed ? styles.pressed : null]}>
      <Text style={styles.title}>Same class as a friend?</Text>
      <Text style={styles.body}>Copy their timetable with a share code instead of typing it all in. ›</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg, marginBottom: space.xl },
  pressed: { backgroundColor: colors.surface },
  title: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
  body: { fontSize: 14, color: colors.primary, lineHeight: 20 },
});
