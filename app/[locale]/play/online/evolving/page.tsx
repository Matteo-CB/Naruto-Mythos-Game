import { redirect } from 'next/navigation';

export default async function EvolvingPageRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/play/online?mode=evolving`);
}
