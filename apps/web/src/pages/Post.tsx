import { Link, useLocation, useParams } from "wouter";
import { ChevronLeft } from "../components/icons";
import { PostDetail } from "../components/PostDetail";

export function PostPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-8">
      <Link
        href="/"
        className="inline-flex h-7 w-fit items-center gap-1 rounded-full px-2.5 text-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <ChevronLeft /> All feedback
      </Link>
      <PostDetail id={Number(id)} onDeleted={() => navigate("/")} />
    </div>
  );
}
