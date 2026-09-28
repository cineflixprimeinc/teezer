# Dummy homepage videos

Drop three 15-second MP4 files here. The feed (`features/feed/feed-page.tsx`)
references them at these exact paths:

| File                          | Pixel size  | Aspect       |
| ----------------------------- | ----------- | ------------ |
| `dummy-portrait.mp4`          | 1080 × 1920 | Portrait 9:16 |
| `dummy-square.mp4`            | 1080 × 1080 | Square 1:1   |
| `dummy-landscape.mp4`         | 1920 × 1080 | Landscape 16:9 |

When a file is missing, the player falls back to the gradient placeholder so
the build does not break.

To generate them quickly with ffmpeg from any source clip `src.mp4`:

```sh
ffmpeg -i src.mp4 -t 15 -vf "crop=ih*9/16:ih,scale=1080:1920" -an dummy-portrait.mp4
ffmpeg -i src.mp4 -t 15 -vf "crop=ih:ih,scale=1080:1080"      -an dummy-square.mp4
ffmpeg -i src.mp4 -t 15 -vf "scale=1920:1080"                 -an dummy-landscape.mp4
```

Files in this directory are served by Next at `/videos/<filename>`.
