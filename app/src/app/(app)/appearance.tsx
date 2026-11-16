import { Text } from 'react-native';
import { APPEARANCES } from '../../lib/appearance.ts';
import { useAppearance } from '../../themeChoice.tsx';
import { Segmented } from '../../ui/Controls.tsx';
import { Page } from '../../ui/Page.tsx';
import { makeStyles } from '../../ui/theme.ts';

export default function AppearanceScreen() {
  const styles = useStyles();
  const { appearance, setAppearance } = useAppearance();
  return (
    <Page>
      <Segmented label="Colours" options={APPEARANCES} value={appearance} onChange={setAppearance} />
      <Text style={styles.note}>Same as phone switches between light and dark when your phone does. This choice is kept on this device only.</Text>
    </Page>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  note: { fontSize: 13, color: colors.muted, lineHeight: 18 },
}));
