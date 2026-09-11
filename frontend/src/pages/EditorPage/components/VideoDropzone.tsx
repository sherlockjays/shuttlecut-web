import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { uploadVideo } from "@/apis/video";
import type { UploadedVideo } from "@/models/video";

/**
 * 영상을 올리는 자리. 진행률이 여기서만 바뀌므로 업로드 중 리렌더도 여기서 멈춘다.
 * 올라간 영상을 어디에 반영할지는 호출부가 정한다.
 */
export default function VideoDropzone({
  onUploaded,
}: {
  onUploaded: (video: UploadedVideo) => void;
}) {
  const [progress, setProgress] = useState(0);

  const { mutate, isPending } = useMutation({
    mutationFn: (file: File) => uploadVideo(file, setProgress),
    onMutate: () => setProgress(0),
    onSuccess: onUploaded,
    onError: (e) => alert(e.message),
  });

  return (
    <label
      className="flex-1 border-2 border-dashed border-gray-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 transition-colors"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) mutate(file);
      }}
    >
      <p className="text-4xl mb-2">🎬</p>
      <p className="text-gray-400">
        {isPending
          ? `업로드 중... ${progress}%`
          : "영상 파일을 클릭하거나 드래그하여 업로드"}
      </p>
      <input
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && mutate(e.target.files[0])}
      />
    </label>
  );
}
