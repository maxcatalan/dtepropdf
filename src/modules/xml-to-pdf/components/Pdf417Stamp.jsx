import { useEffect, useRef } from 'react';

export default function Pdf417Stamp({ text }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function renderStamp() {
      if (!canvasRef.current || !text) {
        return;
      }

      try {
        const bwipjs = await import('@bwip-js/browser');
        if (!active || !canvasRef.current) {
          return;
        }

        bwipjs.default.toCanvas(canvasRef.current, {
          bcid: 'pdf417',
          text,
          scale: 2,
          height: 12,
          columns: 7,
          padding: 0,
          backgroundcolor: 'FFFFFF',
        });
      } catch (error) {
        console.error('No se pudo renderizar el PDF417 del TED.', error);

        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');

        if (!canvas || !context) {
          return;
        }

        canvas.width = 720;
        canvas.height = 220;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = '#d0d0d0';
        context.strokeRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#666666';
        context.font = '28px sans-serif';
        context.textAlign = 'center';
        context.fillText('TED no disponible', canvas.width / 2, canvas.height / 2);
      }
    }

    renderStamp();

    return () => {
      active = false;
    };
  }, [text]);

  if (!text) {
    return <div className="stamp-placeholder">TED no disponible</div>;
  }

  return <canvas ref={canvasRef} className="stamp-canvas" />;
}
