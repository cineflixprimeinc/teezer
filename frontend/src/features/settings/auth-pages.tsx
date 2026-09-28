"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { apiMessage } from "@/services/api";
import { authService } from "@/services/auth.service";
import { LoginContent } from "@/features/auth/login-content";
import { SignupContent } from "@/features/auth/signup-content";

function AuthFrame({
  title, subtitle, children, footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f8f9fb] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md flex-col justify-center">
        <Card className="p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo />
            <h1 className="mt-7 text-2xl font-bold text-black">{title}</h1>
            <p className="mt-2 text-sm text-[#5f6675]">{subtitle}</p>
          </div>
          {children}
          {footer ? <div className="mt-6 text-center text-sm text-[#5f6675]">{footer}</div> : null}
        </Card>
      </div>
    </main>
  );
}

export function LoginPage() {
  return (
    <AuthFrame
      title="Welcome Back"
      subtitle="Log in to continue watching and creating reels."
      footer={
        <>Do not have an account? <Link href="/register" className="font-bold text-[#fd4605]">Register</Link></>
      }
    >
      <LoginContent />
    </AuthFrame>
  );
}

export function RegisterPage() {
  return (
    <AuthFrame
      title="Create Account"
      subtitle="Join Teezer and start sharing your moments."
      footer={
        <>Already have an account? <Link href="/login" className="font-bold text-[#fd4605]">Log in</Link></>
      }
    >
      <SignupContent />
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      toast.success("Password reset link sent");
    } catch (error) {
      toast.error(apiMessage(error));
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthFrame title="Reset password" subtitle="Enter your email to receive reset instructions.">
      <form onSubmit={submit} className="space-y-4">
        <div className="relative">
          <span className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6675]"><Mail /></span>
          <Input className="pl-11" required name="email" type="email" placeholder="Email address" />
        </div>
        <Button className="w-full" disabled={loading}>Send reset link</Button>
      </form>
    </AuthFrame>
  );
}

function ResetPasswordForm() {
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      token: String(fd.get("token") ?? ""),
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      password_confirmation: String(fd.get("password_confirmation") ?? ""),
    };
    setLoading(true);
    try {
      await authService.resetPassword(payload);
      setDone(true);
      toast.success("Password reset successfully. You can now log in.");
    } catch (err) {
      toast.error(apiMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFrame
      title="Choose new password"
      subtitle="Enter your new password below."
      footer={done ? <Link href="/login" className="font-bold text-[#fd4605]">Go to Login</Link> : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input name="token" defaultValue={params.get("token") ?? ""} placeholder="Reset token" required />
        <Input name="email" type="email" defaultValue={params.get("email") ?? ""} placeholder="Email address" required />
        <Input name="password" type="password" placeholder="New password" required minLength={8} />
        <Input name="password_confirmation" type="password" placeholder="Confirm new password" required minLength={8} />
        <Button className="w-full" disabled={loading || done}>
          {done ? "Password Reset" : "Reset Password"}
        </Button>
      </form>
    </AuthFrame>
  );
}

export function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
