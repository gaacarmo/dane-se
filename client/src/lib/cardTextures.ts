import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import type { Card } from '@dane-se/shared';
import { cardId } from '@dane-se/shared';
import { CardBack, PlayingCard } from '../components/cards/PlayingCard';

const WIDTH = 500;
const HEIGHT = 700;
const cache = new Map<string, THREE.Texture>();

function resolveVars(markup: string): string {
  const style = getComputedStyle(document.documentElement);
  return markup.replace(/var\((--[a-z0-9-]+)\)/gi, (_, name: string) => style.getPropertyValue(name).trim() || '#fffdf6');
}

function build(markup: string): THREE.Texture {
  const texture = new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const svg = resolveVars(markup).replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" `);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.getContext('2d')!.drawImage(img, 0, 0, WIDTH, HEIGHT);
    texture.image = canvas;
    texture.needsUpdate = true;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return texture;
}

/** Texture of a card face (or the back when `card` is null), rendered once from the same SVG the 2D table uses. */
export function cardTexture(card: Card | null, highlight = false): THREE.Texture {
  const key = card ? `${cardId(card)}${highlight ? '*' : ''}` : 'back';
  let t = cache.get(key);
  if (!t) {
    t = build(renderToStaticMarkup(card ? createElement(PlayingCard, { card, highlight }) : createElement(CardBack)));
    cache.set(key, t);
  }
  return t;
}
