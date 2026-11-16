import { ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { makeStyles, space } from '../ui/theme.ts';

const SECTIONS = [
  {
    title: 'What attracker keeps',
    points: [
      'Your email address, and your password stored only as a one-way hash. If you sign in with Google, attracker keeps the ID Google gives your account and your email, nothing else from Google.',
      'What you enter: semesters, subjects, the weekly timetable, holidays, attendance marks and the attendance your college gave you.',
      'A sign-in record for each device you log in on, with a short description of the browser or phone, so you stay logged in.',
      'Your IP address, for at most a day, to stop people guessing passwords or sending too many requests. The server’s request logs, which Render keeps for a limited time, also record each request with your IP address and browser, to fix problems.',
      'Codes for resetting your password, which expire after a short time.',
    ],
  },
  {
    title: 'What stays on your phone',
    points: ['Your login, in the phone’s secure storage, a copy of your attendance so the app works offline, your reminder and colour choices, and the reminders themselves, which the phone schedules on its own.'],
  },
  {
    title: 'Who else handles it',
    points: [
      'Render runs the server and Neon runs the database where your data is stored. Cloudflare serves the website. Brevo sends password reset emails. Google checks your sign-in when you use Continue with Google.',
      'Nobody else gets your data. There are no ads, no analytics and no tracking, and nothing is sold.',
    ],
  },
  {
    title: 'Who can see your attendance',
    points: ['Only you. A share code lets a classmate copy your subjects, timetable and holidays, never your attendance.'],
  },
  {
    title: 'Deleting your data',
    points: [
      'You can delete any semester, with all its attendance, from Settings at any time.',
      'To delete your whole account, open an issue at github.com/pranav162074/attracker and it will be removed.',
    ],
  },
];

export default function Privacy() {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <View style={styles.top}>
            <Link href="/" style={styles.brand}>
              attracker
            </Link>
          </View>
          <Text style={styles.title} role="heading">
            Privacy
          </Text>
          <Text style={styles.lead}>attracker is a student project for tracking attendance. This page says what it stores and why.</Text>
          {SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.heading} role="heading">
                {section.title}
              </Text>
              {section.points.map((point) => (
                <Text key={point} style={styles.point}>
                  {point}
                </Text>
              ))}
            </View>
          ))}
          <Text style={styles.updated}>Last updated 16 November 2026.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: space.xl, paddingBottom: space.xxl },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  top: { flexDirection: 'row', marginBottom: space.xxl },
  brand: { fontSize: 17, fontWeight: '700', color: colors.primary },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: space.md },
  lead: { fontSize: 16, color: colors.muted, lineHeight: 24, marginBottom: space.lg },
  section: { paddingVertical: space.lg, borderTopWidth: 1, borderTopColor: colors.surface },
  heading: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: space.sm },
  point: { fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: space.sm },
  updated: { fontSize: 13, color: colors.muted, marginTop: space.lg },
}));
