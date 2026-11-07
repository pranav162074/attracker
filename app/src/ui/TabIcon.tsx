import { StyleSheet, View } from 'react-native';
import type { ColorValue } from 'react-native';

type Name = 'today' | 'subjects' | 'calendar' | 'settings';

export const TabIcon = ({ name, colour }: { name: Name; colour: ColorValue }) => {
  if (name === 'today') {
    return (
      <View style={styles.box}>
        <View style={[styles.roof, { borderBottomColor: colour }]} />
        <View style={[styles.house, { borderColor: colour }]} />
      </View>
    );
  }
  if (name === 'subjects') {
    return (
      <View style={[styles.box, styles.lines]}>
        {[0, 1, 2].map((line) => (
          <View key={line} style={[styles.line, { backgroundColor: colour }]} />
        ))}
      </View>
    );
  }
  if (name === 'calendar') {
    return (
      <View style={styles.box}>
        <View style={[styles.page, { borderColor: colour }]}>
          <View style={[styles.pageTop, { backgroundColor: colour }]} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <View style={[styles.ring, { borderColor: colour }]}>
        <View style={[styles.centre, { backgroundColor: colour }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { width: 24, height: 22, alignItems: 'center', justifyContent: 'center' },
  roof: { width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  house: { width: 14, height: 10, borderWidth: 2, borderTopWidth: 0 },
  lines: { gap: 4 },
  line: { width: 18, height: 2, borderRadius: 1 },
  page: { width: 18, height: 17, borderWidth: 2, borderRadius: 3, overflow: 'hidden' },
  pageTop: { height: 4 },
  ring: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  centre: { width: 6, height: 6, borderRadius: 3 },
});
