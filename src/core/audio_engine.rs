use anyhow::Result;

#[cfg(feature = "local-audio")]
use std::fs::File;
#[cfg(feature = "local-audio")]
use cpal::traits::{DeviceTrait, HostTrait};
#[cfg(feature = "local-audio")]
use symphonia::core::{
    audio::SampleBuffer,
    codecs::DecoderOptions,
    formats::FormatOptions,
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
};

#[cfg(feature = "local-audio")]
pub struct LocalAudioEngine {
    device_name: String,
}

#[cfg(feature = "local-audio")]
impl LocalAudioEngine {
    pub fn new() -> Self {
        let host = cpal::default_host();
        let device_name = host
            .default_output_device()
            .and_then(|d| d.name().ok())
            .unwrap_or_else(|| "default-alsa".to_string());
        Self { device_name }
    }

    pub fn play_file(&self, path: &str) -> Result<()> {
        let file = File::open(path)?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());
        let mut hint = Hint::new();
        if path.ends_with(".mp3") {
            hint.with_extension("mp3");
        }

        let probed = symphonia::default::get_probe().format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )?;

        let mut format = probed.format;
        let Some(track) = format.default_track() else {
            return Ok(());
        };
        let mut decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())?;

        if let Ok(packet) = format.next_packet() {
            if let Ok(audio_buf) = decoder.decode(&packet) {
                let spec = *audio_buf.spec();
                let mut sample_buf = SampleBuffer::<f32>::new(audio_buf.capacity() as u64, spec);
                sample_buf.copy_interleaved_ref(audio_buf);
            }
        }
        let _ = &self.device_name;
        Ok(())
    }
}

/// Zero-overhead stub when `local-audio` feature is disabled (default).
#[cfg(not(feature = "local-audio"))]
pub struct LocalAudioEngine;

#[cfg(not(feature = "local-audio"))]
impl LocalAudioEngine {
    pub fn new() -> Self {
        Self
    }

    pub fn play_file(&self, _path: &str) -> Result<()> {
        Ok(())
    }
}
