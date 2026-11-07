import { useLocalSearchParams, useRouter } from 'expo-router';
import { MonthView } from '../../../../screens/MonthView.tsx';
import { Page } from '../../../../ui/Page.tsx';

export default function MonthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; m?: string }>();
  return (
    <Page>
      <MonthView timetableId={Number(params.id)} month={params.m} onMonth={(m) => router.setParams({ m })} />
    </Page>
  );
}
