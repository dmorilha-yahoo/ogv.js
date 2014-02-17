/**
 * Object that we can throw audio data into and have it drain out.
 *
 * @todo better timing!
 * @todo resample input
 */
function AudioFeeder(channels, rate) {
	// assume W3C Audio API
	
	var AudioContext = window.AudioContext || window.webkitAudioContext;
	if (!AudioContext) {
		// use Flash fallback
		console.log("No W3C Web Audio API available");
		this.flashaudio = new DynamicAudio();
	}
	

	var bufferSize = 1024;

	function freshBuffer() {
		var buffer = [];
		for (var channel = 0; channel < channels; channel++) {
			buffer[channel] = new Float32Array(bufferSize);
		}
		return buffer;
	}
	
	var buffers = [],
		context,
		node,
		pendingBuffer = freshBuffer(),
		pendingPos = 0,
		muted = false;

	if(AudioContext) {
		context = new AudioContext;
		if (context.createScriptProcessor) {
			node = context.createScriptProcessor(bufferSize, 0, channels)
		} else if (context.createJavaScriptNode) {
			node = context.createJavaScriptNode(bufferSize, 0, channels)
		} else {
			throw new Error("Bad version of web audio API?");
		}
	}
	
	function popNextBuffer() {
		// hack hack
		// fixme: grab the right number of samples
		// and... rescale 
		if (buffers.length > 0) {
			return buffers.shift();
		}
	}

	if(node) {
		node.onaudioprocess = function(event) {
			var inputBuffer = popNextBuffer(bufferSize);
			if (!muted && inputBuffer) {
				for (var channel = 0; channel < channels; channel++) {
					var input = inputBuffer[channel],
						output = event.outputBuffer.getChannelData(channel);
					for (var i = 0; i < Math.min(bufferSize, input.length); i++) {
						output[i] = input[i];
					}
				}
			} else {
				if (!inputBuffer) {
					console.log("Starved for audio!");
				}
				for (var channel = 0; channel < channels; channel++) {
					var output = event.outputBuffer.getChannelData(channel);
					for (var i = 0; i < bufferSize; i++) {
						output[i] = 0;
					}
				}
			}
		};
		node.connect(context.destination);
	}
	
	/**
	 * This is horribly naive and wrong.
	 * Replace me with a better algo!
	 */
	function resample(samples) {
		var targetRate = context.sampleRate;
		if (rate == targetRate) {
			return samples;
		} else {
			var newSamples = [];
			for (var channel = 0; channel < channels; channel++) {
				var input = samples[channel],
					output = new Float32Array(Math.round(input.length * targetRate / rate));
				for (var i = 0; i < output.length; i++) {
					output[i] = input[Math.floor(i * rate / targetRate)];
				}
				newSamples.push(output);
			}
			return newSamples;
		}
	}

	/**
	 * Resampling, scaling and reordering for the Flash fallback.
	 * The Flash fallback expects 44.1 kHz, stereo
	 * Resampling: This is horribly naive and wrong.
	 * TODO: Replace me with a better algo!
	 * TODO: Convert mono audio to stereo
	 */
	function resampleFlash(samples) {
		var sampleincr = rate / 44100;
		var samplecount = Math.floor(samples[0].length * (44100 / rate));
		var newSamples = new Array(samplecount * channels);
		for(var s = 0; s < samplecount; s++) {
			var idx = Math.floor(s * sampleincr);
			for(var c = 0; c < channels; ++c) {
				newSamples[(s * channels) + c] = Math.floor(samples[c][idx] * 32768);
			}
		}
		return newSamples;
	}

	
	function pushSamples(samples) {
		var firstChannel = samples[0],
			sampleCount = firstChannel.length;
		for (var i = 0; i < sampleCount; i++) {
			for (var channel = 0; channel < channels; channel++) {
				pendingBuffer[channel][pendingPos] = samples[channel][i];
			}
			if (++pendingPos == bufferSize) {
				buffers.push(pendingBuffer);
				pendingPos = 0;
				pendingBuffer = freshBuffer();
			}
		}
	}
	
	var self = this;
	this.bufferData = function(samplesPerChannel) {
		if(this.flashaudio) {
			var resamples = resampleFlash(samplesPerChannel);
			if(resamples.length > 0) this.flashaudio.flashElement.write(resamples.join(' '));
		} else if (buffers) {
			samples = resample(samplesPerChannel);
			pushSamples(samples);
		} else {
			self.close();
		}
	};
	
	this.mute = function() {
		muted = true;
	};
	
	this.unmute = function() {
		muted = false;
	}
	
	this.close = function() {
		if (node) {
			node.onaudioprocess = null;
			node.disconnect();
		}
		node = null;
		context = null;
		buffers = null;
	};
}


/** Flash fallback **/

/*
The Flash fallback is based on https://github.com/an146/dynamicaudio.js

This is the contents of the LICENSE file:

Copyright (c) 2010, Ben Firshman
All rights reserved.
 
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
 
 * Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
 * The names of its contributors may not be used to endorse or promote products
   derived from this software without specific prior written permission.
 
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/


function DynamicAudio(args) {
	if (this instanceof arguments.callee) {
		if (typeof this.init === "function") {
			this.init.apply(this, (args && args.callee) ? args : arguments);
		}
	} else {
		return new arguments.callee(arguments);
	}
}


DynamicAudio.nextId = 1;

DynamicAudio.prototype = {
	nextId: null,
	swf: 'dynamicaudio.swf',

	flashWrapper: null,
	flashElement: null,
    
	init: function(opts) {
		var self = this;
		self.id = DynamicAudio.nextId++;

		if (opts && typeof opts['swf'] !== 'undefined') {
			self.swf = opts['swf'];
		}

		self.flashWrapper = document.createElement('div');
		self.flashWrapper.id = 'dynamicaudio-flashwrapper-'+self.id;
		// Credit to SoundManager2 for this:
		var s = self.flashWrapper.style;
		s['position'] = 'fixed';
		s['width'] = '11px'; // must be at least 6px for flash to run fast
		s['height'] = '11px';
		s['bottom'] = s['left'] = '0px';
		s['overflow'] = 'hidden';
		self.flashElement = document.createElement('div');
		self.flashElement.id = 'dynamicaudio-flashelement-'+self.id;
		self.flashWrapper.appendChild(self.flashElement);

		document.body.appendChild(self.flashWrapper);

		var id = self.flashElement.id;

		self.flashWrapper.innerHTML = "<object id='"+id+"' width='10' height='10' type='application/x-shockwave-flash' data='"+self.swf+"' style='visibility: visible;'><param name='allowscriptaccess' value='always'></object>";
		self.flashElement = document.getElementById(id);
	},
};

