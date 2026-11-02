import { StyleSheet, Text, View } from 'react-native';
import type { Tone } from '../lib/format.ts';
import { tones } from './theme.ts';

export const Badge = ({ label, tone }: { label: string; tone: Tone }) => (
  <View style={[styles.badge, { backgroundColor: tones[tone].background }]}>
    <Text style={[styles.text, { color: tones[tone].text }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontSize: 13, fontWeight: '600' },
});
