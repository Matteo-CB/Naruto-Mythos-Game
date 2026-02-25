'use client';

import { useEffect } from 'react';
import { useRouter } from '@/lib/i18n/navigation';

export default function QuizPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/learn');
  }, [router]);

  return null;
}
