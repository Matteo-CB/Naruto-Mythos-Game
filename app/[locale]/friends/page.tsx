import { redirect } from 'next/navigation';

export default async function FriendsRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/leaderboard?tab=friends`);
}
