import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../../../session.tsx';
import { chooseSemester } from '../../../../currentSemester.ts';
import { problemFrom } from '../../../../lib/forms.ts';
import { resumeStep, setupPath } from '../../../../lib/semester.ts';
import { LoadFailed, Loading } from '../../../../ui/Page.tsx';

export default function OpenSemester() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const timetableId = Number(id);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .setup(timetableId)
      .then(async (setup) => {
        await chooseSemester(timetableId);
        if (!active) return;
        router.replace(setup.status === 'setup' ? setupPath(timetableId, resumeStep(setup.steps)) : '/');
      })
      .catch((failure: unknown) => {
        if (active) setFailed(problemFrom(failure).message ?? 'Could not open this semester.');
      });
    return () => {
      active = false;
    };
  }, [timetableId, router, attempt]);

  if (failed)
    return (
      <LoadFailed
        message={failed}
        onRetry={() => {
          setFailed(null);
          setAttempt((value) => value + 1);
        }}
        busy={false}
      />
    );
  return <Loading />;
}
