// /dashboard/lessons → 반 운영 목록으로 리다이렉트
import { redirect } from 'next/navigation';

export default function LessonsIndexPage() {
  redirect('/dashboard/lessons/classes');
}
