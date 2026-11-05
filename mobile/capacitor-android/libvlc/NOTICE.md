# LibVLC Android notice

XoraTV uses the official VideoLAN Android LibVLC engine via Maven Central:

- Artifact: `org.videolan.android:libvlc-all:3.7.7`
- License declared by the artifact: GNU LGPL version 2.1
- Upstream: https://code.videolan.org/videolan/libvlcjni
- Official Android project and license notes: https://github.com/videolan/vlc-android

This is the LGPL LibVLC engine, not the GPL-licensed VLC Android application. Before a public production release, XoraTV must ship the applicable LGPL license text and preserve users' rights to replace/relink the shared library, together with source or source-offer information for the exact distributed binary and any modifications. Review all transitive dependencies and bundled plugin licenses before release; do not assume every optional codec/plugin has the same license.
