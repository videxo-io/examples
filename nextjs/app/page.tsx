import { UploadForm } from './upload-form';

export default function Home() {
  return (
    <main>
      <h1>Videxo example</h1>
      <p>Pick a file: the browser uploads it to Videxo with a one-time URL from this app, then a route handler creates the job.</p>
      <UploadForm />
    </main>
  );
}
