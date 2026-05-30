import { redirect } from 'next/navigation';

export default async function QuestsRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/battlepass?tab=quests`);
}
