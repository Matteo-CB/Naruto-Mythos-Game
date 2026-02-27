import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Discord from 'next-auth/providers/discord';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { syncDiscordRole } from '@/lib/discord/roleSync';

const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith('https://') ?? false;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  trustHost: true,
  cookies: {
    sessionToken: {
      name: useSecureCookies ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: useSecureCookies ? '__Secure-authjs.callback-url' : 'authjs.callback-url',
      options: {
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: useSecureCookies ? '__Host-authjs.csrf-token' : 'authjs.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );

        if (!isValid) return null;

        return {
          id: user.id,
          name: user.username,
          email: user.email,
        };
      },
    }),
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'identify email guilds.join',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'discord' && profile) {
        const discordId = profile.id as string;
        const discordUsername = (profile as { username?: string }).username ?? profile.name ?? 'user';

        // Check if a user already exists with this discordId
        const existingUser = await prisma.user.findFirst({
          where: { discordId },
        });

        if (existingUser) {
          // Update discordUsername if changed
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { discordUsername },
          });

          // Override the user id/name so the JWT uses our existing user
          user.id = existingUser.id;
          user.name = existingUser.username;
          user.email = existingUser.email;

          // Ensure the Account record exists for this user
          const existingAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: 'discord',
                providerAccountId: discordId,
              },
            },
          });

          if (!existingAccount) {
            await prisma.account.create({
              data: {
                userId: existingUser.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token as string | undefined,
                refresh_token: account.refresh_token as string | undefined,
                expires_at: account.expires_at as number | undefined,
                token_type: account.token_type as string | undefined,
                scope: account.scope as string | undefined,
              },
            });
          }

          // Trigger role sync (fire-and-forget)
          syncDiscordRole(existingUser.id).catch(() => {});

          return true;
        }

        // No existing user with this discordId — check if there's a linked Account
        const existingAccount = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: 'discord',
              providerAccountId: discordId,
            },
          },
          include: { user: true },
        });

        if (existingAccount) {
          // Account already linked — update discordId/username on user
          await prisma.user.update({
            where: { id: existingAccount.userId },
            data: { discordId, discordUsername },
          });

          user.id = existingAccount.user.id;
          user.name = existingAccount.user.username;
          user.email = existingAccount.user.email;

          syncDiscordRole(existingAccount.userId).catch(() => {});
          return true;
        }

        // Brand new Discord user — create user + account
        // Generate a unique username from Discord username
        let baseUsername = discordUsername.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 17);
        if (baseUsername.length < 3) baseUsername = `user_${discordId.slice(-6)}`;
        let finalUsername = baseUsername;
        let suffix = 1;

        while (await prisma.user.findUnique({ where: { username: finalUsername } })) {
          finalUsername = `${baseUsername}${suffix}`;
          suffix++;
        }

        const discordEmail = (profile as { email?: string }).email;
        let email = discordEmail || `discord_${discordId}@naruto-mythos.local`;

        // Check email uniqueness
        const emailExists = await prisma.user.findUnique({ where: { email } });
        if (emailExists) {
          email = `discord_${discordId}@naruto-mythos.local`;
        }

        const newUser = await prisma.user.create({
          data: {
            username: finalUsername,
            email,
            password: '', // No password for OAuth users
            discordId,
            discordUsername,
            elo: 500,
          },
        });

        await prisma.account.create({
          data: {
            userId: newUser.id,
            type: account.type,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            access_token: account.access_token as string | undefined,
            refresh_token: account.refresh_token as string | undefined,
            expires_at: account.expires_at as number | undefined,
            token_type: account.token_type as string | undefined,
            scope: account.scope as string | undefined,
          },
        });

        user.id = newUser.id;
        user.name = newUser.username;
        user.email = newUser.email;

        // Trigger initial role sync
        syncDiscordRole(newUser.id).catch(() => {});

        return true;
      }

      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
      }

      // For Discord sign-in, we already set user.id in signIn callback
      if (account?.provider === 'discord' && user?.id) {
        token.id = user.id;
        token.name = user.name;
      }

      // Refresh discordId from DB on sign-in or session update
      if (token.id && (trigger === 'signIn' || trigger === 'update' || !('discordId' in token))) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { discordId: true },
          });
          token.discordId = dbUser?.discordId ?? null;
        } catch {
          // Keep existing value on error
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        (session.user as unknown as Record<string, unknown>).discordId = token.discordId as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
