import { redirect } from 'next/navigation';

export default async function BoostersRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/battlepass?tab=boosters`);
}
