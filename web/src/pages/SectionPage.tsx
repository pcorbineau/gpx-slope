import { useParams } from "react-router-dom";

export default function SectionPage() {
  const { n } = useParams();
  return (
    <div>
      <h1>Section {n}</h1>
      <a href="/">← Back to profile</a>
    </div>
  );
}
