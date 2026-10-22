# menu-images-app

Point your phone camera at a menu and see pictures of the dishes,
live, like Google Translate's camera mode but for food photos.

Works on both iOS and Android.

## Plan

- Built with Flutter, so one codebase covers iOS and Android.
- On-device OCR with Google ML Kit Text Recognition,
  run on camera frames so text is found live with no network round trip.
- Group the recognized text into menu lines and filter out prices, headers, and descriptions,
  so each dish name becomes one item.
- Look up an image per dish name through an image search API, cached by dish name.
- Draw a thumbnail over or beside each dish's bounding box in the live camera view;
  tap one to see larger images and a short description.
- Freeze-frame mode for reading a menu without holding the phone steady.
